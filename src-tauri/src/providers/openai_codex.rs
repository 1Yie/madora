//! `openai-codex` is Responses over WebSocket, authenticated with an API key.
//! It is NOT the ChatGPT/Codex subscription OAuth backend. See
//! `src-tauri/docs/responses-transports.md` for the verified wire contract.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use reqwest::Url;
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest,
        http::{header::AUTHORIZATION, HeaderValue},
        protocol::WebSocketConfig,
        Error, Message,
    },
};

use super::{
    common::{
        detect_error_payload, validate_api_url, OpenEndedStop, PreparedCompletion,
        MAX_SSE_BUFFER_BYTES,
    },
    openai_responses::{
        build_responses_payload, check_stream_event, responses_endpoint,
        take_responses_stream_text, ResponsesApiStreamEvent,
    },
};
use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_openai_compatible, PromptManager},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const READ_TIMEOUT: Duration = Duration::from_secs(30);

fn websocket_endpoint(base: &str) -> Result<Url, String> {
    let mut url = responses_endpoint(base)?;
    // Run WS URLs through exactly the existing HTTP(S) security policy:
    // plaintext is local/private only, TLS is required on public networks.
    match url.scheme() {
        "ws" => {
            let _ = url.set_scheme("http");
        }
        "wss" => {
            let _ = url.set_scheme("https");
        }
        _ => {}
    }
    validate_api_url(url.as_str())?;
    let scheme = match url.scheme() {
        "https" => "wss",
        "http" => "ws",
        _ => return Err("Unsupported Responses WebSocket URL scheme".into()),
    };
    url.set_scheme(scheme)
        .map_err(|_| "Invalid WebSocket URL".to_string())?;
    Ok(url)
}

fn transport_error(error: Error) -> String {
    // Do not render HTTP headers or a full handshake request (credentials).
    match error {
        Error::Http(response) => format!(
            "Responses WebSocket handshake failed (HTTP {})",
            response.status()
        ),
        Error::Capacity(_) => "Responses WebSocket frame/message exceeds the size limit".into(),
        Error::ConnectionClosed | Error::AlreadyClosed => {
            "Responses WebSocket closed before response.completed".into()
        }
        _ => "Responses WebSocket transport failed".into(),
    }
}

pub(crate) async fn complete(
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    complete_with_timeout(prompt_manager, config, request, on_chunk, REQUEST_TIMEOUT).await
}

async fn complete_with_timeout(
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    budget: Duration,
) -> Result<String, String> {
    // Each completion owns its socket. No detached reader, shared conversation
    // history or automatic replay after partial output. Dropping this future
    // (the service's cancellation path) drops the socket immediately.
    timeout(budget, async {
        let PreparedCompletion {
            connection,
            system_prompt,
            user_prompt,
        } = PreparedCompletion::prepare(
            prompt_manager,
            config,
            request,
            prompt_profile_for_openai_compatible,
            AiProvider::Custom,
            OpenEndedStop::Structural,
        )?;
        let url = websocket_endpoint(&connection.api_url)?;
        let mut handshake = url
            .as_str()
            .into_client_request()
            .map_err(|_| "Invalid WebSocket handshake URL".to_string())?;
        let mut authorization = HeaderValue::from_str(&format!("Bearer {}", connection.api_key))
            .map_err(|_| "Invalid WebSocket API key header".to_string())?;
        authorization.set_sensitive(true);
        handshake.headers_mut().insert(AUTHORIZATION, authorization);

        let mut payload = build_responses_payload(
            &connection.model,
            system_prompt,
            user_prompt,
            connection.params,
            true,
        );
        let object = payload.as_object_mut().unwrap();
        object.remove("stream");
        object.insert("type".into(), "response.create".into());
        let body = payload.to_string();
        if body.len() > MAX_SSE_BUFFER_BYTES {
            return Err("Responses WebSocket request exceeds the size limit".into());
        }
        let limits = WebSocketConfig::default()
            .max_frame_size(Some(MAX_SSE_BUFFER_BYTES))
            .max_message_size(Some(MAX_SSE_BUFFER_BYTES));
        let (mut socket, _) = timeout(
            CONNECT_TIMEOUT,
            connect_async_with_config(handshake, Some(limits), false),
        )
        .await
        .map_err(|_| "Responses WebSocket connection timed out".to_string())?
        .map_err(transport_error)?;
        let result = async {
            socket
                .send(Message::Text(body.into()))
                .await
                .map_err(transport_error)?;
            let mut completion = String::new();
            loop {
                let frame = timeout(READ_TIMEOUT, socket.next())
                    .await
                    .map_err(|_| "Responses WebSocket read timed out".to_string())?
                    .ok_or_else(|| {
                        "Responses WebSocket closed before response.completed".to_string()
                    })?
                    .map_err(transport_error)?;
                match frame {
                    Message::Text(data) => {
                        if let Some(error) = detect_error_payload(&data) {
                            return Err(format!("Responses WebSocket error: {error}"));
                        }
                        let event: ResponsesApiStreamEvent = serde_json::from_str(&data)
                            .map_err(|_| "Invalid Responses WebSocket JSON event".to_string())?;
                        let completed = check_stream_event(&event)?;
                        let chunk = take_responses_stream_text(event, completion.is_empty());
                        if completion.len().saturating_add(chunk.len()) > MAX_SSE_BUFFER_BYTES {
                            return Err("Responses WebSocket output exceeds the size limit".into());
                        }
                        if !chunk.is_empty() {
                            completion.push_str(&chunk);
                            on_chunk(chunk)?;
                        }
                        if completed {
                            return Ok(completion);
                        }
                    }
                    Message::Ping(data) => socket
                        .send(Message::Pong(data))
                        .await
                        .map_err(transport_error)?,
                    Message::Pong(_) => {}
                    Message::Close(_) => {
                        return Err("Responses WebSocket closed before response.completed".into())
                    }
                    _ => return Err("Expected a text Responses WebSocket event".into()),
                }
            }
        }
        .await;
        // No documented Responses response.cancel event: never invent a
        // Realtime API message. A bounded close/drop releases this request's
        // transport; remote computation cancellation is best effort.
        let _ = timeout(Duration::from_millis(100), socket.close(None)).await;
        result
    })
    .await
    .map_err(|_| "Responses WebSocket request timed out".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::CustomProviderProtocol;
    use serde_json::{json, Value};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };
    use tokio::{
        net::TcpListener,
        task::{JoinHandle, JoinSet},
    };
    use tokio_tungstenite::{
        accept_hdr_async,
        tungstenite::{
            handshake::server::{Request, Response},
            protocol::frame::{
                coding::{Data, OpCode},
                Frame,
            },
        },
    };

    #[derive(Clone, Debug)]
    struct Recorded {
        path: String,
        authorization: String,
        body: Value,
    }

    struct WsServer {
        base: String,
        recorded: Arc<Mutex<Vec<Recorded>>>,
        closed: Arc<AtomicUsize>,
        task: JoinHandle<()>,
    }

    impl Drop for WsServer {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    impl WsServer {
        async fn start(messages: Vec<Message>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let recorded = Arc::new(Mutex::new(Vec::new()));
            let closed = Arc::new(AtomicUsize::new(0));
            let records = recorded.clone();
            let closes = closed.clone();
            let task = tokio::spawn(async move {
                let mut children = JoinSet::new();
                loop {
                    tokio::select! {
                        accepted = listener.accept() => {
                            let (stream, _) = accepted.unwrap();
                            let messages = messages.clone();
                            let records = records.clone();
                            let closes = closes.clone();
                            children.spawn(async move {
                                let handshake = Arc::new(Mutex::new(None));
                                let capture = handshake.clone();
                                let mut socket = accept_hdr_async(stream, move |request: &Request, response: Response| {
                                    *capture.lock().unwrap() = Some((
                                        request.uri().to_string(),
                                        request.headers().get(AUTHORIZATION).unwrap().to_str().unwrap().to_string(),
                                    ));
                                    Ok(response)
                                }).await.unwrap();
                                let Some(Ok(Message::Text(body))) = socket.next().await else { return };
                                let (path, authorization) = handshake.lock().unwrap().take().unwrap();
                                records.lock().unwrap().push(Recorded {
                                    path, authorization, body: serde_json::from_str(&body).unwrap(),
                                });
                                for message in messages {
                                    if socket.send(message).await.is_err() {
                                        closes.fetch_add(1, Ordering::SeqCst);
                                        return;
                                    }
                                }
                                // Observe both graceful close and abort/drop.
                                while let Some(Ok(message)) = socket.next().await {
                                    if matches!(message, Message::Close(_)) { break; }
                                }
                                closes.fetch_add(1, Ordering::SeqCst);
                            });
                        }
                        _ = children.join_next(), if !children.is_empty() => {}
                    }
                }
            });
            Self {
                base,
                recorded,
                closed,
                task,
            }
        }

        fn requests(&self) -> Vec<Recorded> {
            self.recorded.lock().unwrap().clone()
        }

        async fn wait_for(&self, predicate: impl Fn() -> bool) {
            timeout(Duration::from_secs(3), async {
                while !predicate() {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
            })
            .await
            .expect("server should observe the client");
        }
    }

    fn text(value: Value) -> Message {
        Message::Text(value.to_string().into())
    }

    fn done(answer: &str) -> Message {
        text(
            json!({"type":"response.completed","response":{"status":"completed","output_text":answer}}),
        )
    }

    fn config(base: String) -> AiCompletionConfig {
        AiCompletionConfig {
            provider: Some(AiProvider::Custom),
            api_key: "test-key-not-in-url".into(),
            api_url: Some(base),
            custom_protocol: Some(CustomProviderProtocol::OpenAiCodex),
            model: Some("any-user-selected-model".into()),
            ..Default::default()
        }
    }

    fn request() -> CompletionRequest {
        CompletionRequest {
            title: None,
            prefix: "prefix text".into(),
            suffix: Some("suffix text".into()),
        }
    }

    #[test]
    fn secure_url_mapping_preserves_proxy_paths_and_rejects_credentials() {
        for (base, expected) in [
            ("https://example.com", "wss://example.com/v1/responses"),
            ("https://example.com/v1", "wss://example.com/v1/responses"),
            (
                "https://example.com/v1/responses",
                "wss://example.com/v1/responses",
            ),
            (
                "https://example.com/proxy/v1",
                "wss://example.com/proxy/v1/responses",
            ),
            (
                "https://example.com/proxy",
                "wss://example.com/proxy/v1/responses",
            ),
            (
                "http://127.0.0.1:123/proxy",
                "ws://127.0.0.1:123/proxy/v1/responses",
            ),
            ("http://[::1]:123/v1", "ws://[::1]:123/v1/responses"),
            (
                "http://192.168.1.10/proxy/v1",
                "ws://192.168.1.10/proxy/v1/responses",
            ),
            ("ws://10.0.0.2/proxy", "ws://10.0.0.2/proxy/v1/responses"),
            (
                "wss://example.com/proxy/v1",
                "wss://example.com/proxy/v1/responses",
            ),
        ] {
            assert_eq!(websocket_endpoint(base).unwrap().as_str(), expected);
        }
        for base in [
            "http://example.com",
            "http://8.8.8.8",
            "ws://example.com",
            "ws://8.8.8.8",
            "https://user:secret@example.com",
            "https://example.com?api_key=secret",
            "https://example.com#secret",
        ] {
            assert!(websocket_endpoint(base).is_err(), "{base}");
        }
    }

    #[tokio::test]
    async fn websocket_handshake_and_create_message_work_through_all_url_forms() {
        let server = WsServer::start(vec![done("answer")]).await;
        let manager = PromptManager::from_user_root(None);
        for (suffix, path) in [
            ("", "/v1/responses"),
            ("/v1", "/v1/responses"),
            ("/v1/responses", "/v1/responses"),
            ("/proxy", "/proxy/v1/responses"),
            ("/proxy/v1", "/proxy/v1/responses"),
            ("/proxy/v1/responses", "/proxy/v1/responses"),
        ] {
            for scheme in ["http://", "ws://"] {
                let base = server.base.replace("http://", scheme);
                let config = config(format!("{base}{suffix}"));
                let result = crate::providers::Protocol::OpenAiCodex
                    .complete(&reqwest::Client::new(), &manager, &config, &request())
                    .await
                    .unwrap();
                assert_eq!(result, "answer");
                let recorded = server.requests().pop().unwrap();
                assert_eq!(recorded.path, path);
                assert_eq!(recorded.authorization, "Bearer test-key-not-in-url");
                assert!(!recorded.path.contains("test-key"));
                let body = recorded.body;
                assert_eq!(body["type"], "response.create");
                assert_eq!(body["model"], "any-user-selected-model");
                assert_eq!(body["store"], false);
                for absent in [
                    "stream",
                    "background",
                    "previous_response_id",
                    "stop",
                    "response",
                ] {
                    assert!(body.get(absent).is_none(), "unexpected field {absent}");
                }
                assert!(body["input"].as_str().unwrap().contains("prefix text"));
                assert!(body["instructions"]
                    .as_str()
                    .is_some_and(|text| !text.is_empty()));
            }
        }
    }

    #[tokio::test]
    async fn websocket_codex_reasoning_uses_supported_parameters() {
        let server = WsServer::start(vec![done("answer")]).await;
        let mut config = config(server.base.clone());
        config.model = Some("gpt-5.3-codex-spark".into());
        let mut request = request();
        request.suffix = None;

        let result = crate::providers::Protocol::OpenAiCodex
            .complete(
                &reqwest::Client::new(),
                &PromptManager::from_user_root(None),
                &config,
                &request,
            )
            .await
            .unwrap();
        assert_eq!(result, "answer");
        let body = &server.requests()[0].body;
        assert_eq!(body["reasoning"]["effort"], "low");
        assert_eq!(body["max_output_tokens"], 512);
        assert!(body.get("temperature").is_none());
    }

    #[tokio::test]
    async fn websocket_streams_deltas_ping_and_completion_without_duplicates() {
        let server = WsServer::start(vec![
            Message::Ping(vec![1, 2].into()),
            text(json!({"type":"response.created","response":{"status":"in_progress"}})),
            text(json!({"type":"response.output_text.delta","delta":"你"})),
            text(json!({"type":"response.output_text.delta","delta":"好"})),
            done("你好"),
        ])
        .await;
        let mut chunks = Vec::new();
        let result = crate::providers::Protocol::OpenAiCodex
            .complete_stream(
                &reqwest::Client::new(),
                &PromptManager::from_user_root(None),
                &config(server.base.clone()),
                &request(),
                &mut |chunk| {
                    chunks.push(chunk);
                    Ok(())
                },
            )
            .await
            .unwrap();
        assert_eq!(result, "你好");
        assert_eq!(chunks, ["你", "好"]);
        server
            .wait_for(|| server.closed.load(Ordering::SeqCst) == 1)
            .await;
    }

    #[tokio::test]
    async fn websocket_fails_for_errors_incomplete_malformed_binary_and_early_close() {
        for message in [
            text(json!({"type":"error","error":{"message":"denied"}})),
            text(
                json!({"type":"response.failed","response":{"status":"failed","error":{"message":"denied"}}}),
            ),
            text(
                json!({"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}}),
            ),
            Message::Text("not-json".into()),
            Message::Binary(vec![1, 2].into()),
            Message::Close(None),
        ] {
            let server = WsServer::start(vec![
                text(json!({"type":"response.output_text.delta","delta":"partial"})),
                message,
            ])
            .await;
            let mut chunks = Vec::new();
            let result = complete(
                &PromptManager::from_user_root(None),
                &config(server.base.clone()),
                &request(),
                &mut |chunk| {
                    chunks.push(chunk);
                    Ok(())
                },
            )
            .await;
            assert!(result.is_err(), "{result:?}");
            assert_eq!(chunks, ["partial"]);
        }
    }

    #[tokio::test]
    async fn websocket_rejects_http_handshake_without_exposing_headers() {
        use crate::providers::test_support::{MockServer, ScriptedResponse};
        let server = MockServer::start(vec![
            ScriptedResponse::json(401, "{}").with_header("x-secret", "test-key-not-in-url")
        ])
        .await;
        let error = complete(
            &PromptManager::from_user_root(None),
            &config(server.base_url.clone()),
            &request(),
            &mut |_| Ok(()),
        )
        .await
        .unwrap_err();
        assert!(error.contains("401"), "{error}");
        assert!(!error.contains("test-key-not-in-url"));
        assert_eq!(server.request_count(), 1);
    }

    #[tokio::test]
    async fn websocket_caps_single_frames_and_fragmented_messages() {
        for messages in [
            vec![Message::Text("x".repeat(MAX_SSE_BUFFER_BYTES + 1).into())],
            vec![
                Message::Frame(Frame::message(
                    vec![b'x'; MAX_SSE_BUFFER_BYTES / 2 + 1],
                    OpCode::Data(Data::Text),
                    false,
                )),
                Message::Frame(Frame::message(
                    vec![b'x'; MAX_SSE_BUFFER_BYTES / 2 + 1],
                    OpCode::Data(Data::Continue),
                    true,
                )),
            ],
        ] {
            let server = WsServer::start(messages).await;
            let error = complete(
                &PromptManager::from_user_root(None),
                &config(server.base.clone()),
                &request(),
                &mut |_| Ok(()),
            )
            .await
            .unwrap_err();
            assert!(error.contains("size limit"), "{error}");
        }
    }

    #[tokio::test]
    async fn websocket_caps_accumulated_output() {
        let chunk = "x".repeat(MAX_SSE_BUFFER_BYTES / 2 + 1);
        let server = WsServer::start(vec![
            text(json!({"type":"response.output_text.delta","delta":chunk})),
            text(json!({"type":"response.output_text.delta","delta":chunk})),
        ])
        .await;
        let error = complete(
            &PromptManager::from_user_root(None),
            &config(server.base.clone()),
            &request(),
            &mut |_| Ok(()),
        )
        .await
        .unwrap_err();
        assert!(error.contains("output exceeds"), "{error}");
    }

    #[tokio::test]
    async fn websocket_timeout_and_callback_cancellation_close_the_connection() {
        let idle = WsServer::start(vec![]).await;
        let error = complete_with_timeout(
            &PromptManager::from_user_root(None),
            &config(idle.base.clone()),
            &request(),
            &mut |_| Ok(()),
            Duration::from_millis(100),
        )
        .await
        .unwrap_err();
        assert!(error.contains("timed out"), "{error}");
        idle.wait_for(|| idle.closed.load(Ordering::SeqCst) == 1)
            .await;

        let active = WsServer::start(vec![text(
            json!({"type":"response.output_text.delta","delta":"partial"}),
        )])
        .await;
        let error = complete(
            &PromptManager::from_user_root(None),
            &config(active.base.clone()),
            &request(),
            &mut |_| Err("consumer cancelled".into()),
        )
        .await
        .unwrap_err();
        assert_eq!(error, "consumer cancelled");
        active
            .wait_for(|| active.closed.load(Ordering::SeqCst) == 1)
            .await;
    }

    #[tokio::test]
    async fn websocket_dropped_future_closes_only_its_own_concurrent_socket() {
        let server = WsServer::start(vec![]).await;
        let mut clients = Vec::new();
        for model in ["first", "second"] {
            let mut config = config(server.base.clone());
            config.model = Some(model.into());
            clients.push(tokio::spawn(async move {
                complete(
                    &PromptManager::from_user_root(None),
                    &config,
                    &request(),
                    &mut |_| Ok(()),
                )
                .await
            }));
        }
        server.wait_for(|| server.requests().len() == 2).await;
        clients[0].abort();
        server
            .wait_for(|| server.closed.load(Ordering::SeqCst) == 1)
            .await;
        assert!(!clients[1].is_finished());
        clients[1].abort();
        server
            .wait_for(|| server.closed.load(Ordering::SeqCst) == 2)
            .await;
        let mut models: Vec<_> = server
            .requests()
            .iter()
            .map(|r| r.body["model"].as_str().unwrap().to_owned())
            .collect();
        models.sort();
        assert_eq!(models, ["first", "second"]);
    }
}
