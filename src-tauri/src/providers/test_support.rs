//! A minimal scripted HTTP/1.1 server for provider tests.
//!
//! Each provider talks to a real socket here, so the tests cover what unit
//! tests on payload builders cannot: the URL and headers that actually go out,
//! status and error handling, retries, and SSE parsing across real chunk
//! boundaries. No extra dependency is needed; `reqwest` only has to read a
//! status line, headers and a body.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// One request as the server received it.
#[derive(Clone, Debug)]
pub struct RecordedRequest {
    pub method: String,
    pub path: String,
    /// Header names are lower-cased.
    pub headers: HashMap<String, String>,
    pub body: String,
}

impl RecordedRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .get(&name.to_ascii_lowercase())
            .map(String::as_str)
    }

    pub fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.body).expect("request body should be JSON")
    }
}

/// What the server sends back for one request.
#[derive(Clone, Debug)]
pub struct ScriptedResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    /// Body pieces. Each piece is written and flushed separately, with a short
    /// pause between them, so the client really sees them arrive as separate
    /// reads (and can see a split in the middle of a multi-byte character).
    pub chunks: Vec<Vec<u8>>,
}

impl ScriptedResponse {
    pub fn json(status: u16, body: &str) -> Self {
        Self {
            status,
            headers: vec![("content-type".into(), "application/json".into())],
            chunks: vec![body.as_bytes().to_vec()],
        }
    }

    /// A `text/event-stream` response made of the given raw pieces.
    pub fn sse(pieces: &[&str]) -> Self {
        Self {
            status: 200,
            headers: vec![("content-type".into(), "text/event-stream".into())],
            chunks: pieces
                .iter()
                .map(|piece| piece.as_bytes().to_vec())
                .collect(),
        }
    }

    pub fn sse_bytes(pieces: Vec<Vec<u8>>) -> Self {
        Self {
            status: 200,
            headers: vec![("content-type".into(), "text/event-stream".into())],
            chunks: pieces,
        }
    }

    pub fn with_header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.to_string(), value.to_string()));
        self
    }
}

pub struct MockServer {
    pub base_url: String,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    task: tokio::task::JoinHandle<()>,
}

impl MockServer {
    /// Starts a server that answers the n-th request with the n-th response.
    /// Once the script runs out, the last response repeats.
    pub async fn start(script: Vec<ScriptedResponse>) -> Self {
        assert!(!script.is_empty(), "the script needs at least one response");

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind a local port");
        let port = listener.local_addr().unwrap().port();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let script = Arc::new(script);

        let task = {
            let requests = requests.clone();
            tokio::spawn(async move {
                let mut served = 0usize;

                loop {
                    let Ok((stream, _)) = listener.accept().await else {
                        break;
                    };
                    let response = script[served.min(script.len() - 1)].clone();
                    served += 1;
                    let requests = requests.clone();

                    tokio::spawn(async move {
                        let _ = handle_connection(stream, response, requests).await;
                    });
                }
            })
        };

        Self {
            base_url: format!("http://127.0.0.1:{port}"),
            requests,
            task,
        }
    }

    pub fn requests(&self) -> Vec<RecordedRequest> {
        self.requests.lock().unwrap().clone()
    }

    pub fn request_count(&self) -> usize {
        self.requests.lock().unwrap().len()
    }
}

impl Drop for MockServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    response: ScriptedResponse,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
) -> std::io::Result<()> {
    let request = read_request(&mut stream).await?;
    requests.lock().unwrap().push(request);

    let reason = match response.status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Status",
    };
    let mut head = format!("HTTP/1.1 {} {}\r\n", response.status, reason);
    for (name, value) in &response.headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str("transfer-encoding: chunked\r\nconnection: close\r\n\r\n");
    stream.write_all(head.as_bytes()).await?;

    for chunk in &response.chunks {
        stream
            .write_all(format!("{:x}\r\n", chunk.len()).as_bytes())
            .await?;
        stream.write_all(chunk).await?;
        stream.write_all(b"\r\n").await?;
        stream.flush().await?;
        tokio::time::sleep(Duration::from_millis(15)).await;
    }

    stream.write_all(b"0\r\n\r\n").await?;
    stream.flush().await?;
    stream.shutdown().await
}

async fn read_request(stream: &mut TcpStream) -> std::io::Result<RecordedRequest> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];

    let header_end = loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        buffer.extend_from_slice(&chunk[..read]);

        if let Some(position) = find_subsequence(&buffer, b"\r\n\r\n") {
            break position;
        }
    };

    let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let mut lines = head.lines();
    let mut request_line = lines.next().unwrap_or_default().split_whitespace();
    let method = request_line.next().unwrap_or_default().to_string();
    let path = request_line.next().unwrap_or_default().to_string();

    let headers: HashMap<String, String> = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect();

    let content_length: usize = headers
        .get("content-length")
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let body_start = header_end + 4;

    while buffer.len() < body_start + content_length {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }

    let body =
        String::from_utf8_lossy(&buffer[body_start..buffer.len().min(body_start + content_length)])
            .to_string();

    Ok(RecordedRequest {
        method,
        path,
        headers,
        body,
    })
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}
