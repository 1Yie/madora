//! WebSocket sync server for Madora.
//!
//! Listens on the configured port (default 3210) and serves file-tree,
//! file-content, and AI-completion requests to authenticated mobile clients.
//! Authentication reuses the existing pairing code/token flow in
//! [`MadoraSyncStore`].

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

use crate::models::ai::{AiCompletionConfig, AiProvider, CompletionRequest};
use crate::models::madora_sync::MadoraSyncPairDeviceInput;
use crate::models::sync_server::{
    AiCompleteMessage, AiResultMessage, AuthErrorMessage, AuthOkMessage, ClientMessage,
    ErrorMessage, FileListMessage, FileListResultMessage, FileReadMessage, FileReadResultMessage,
    FileWriteMessage, FileWriteResultMessage, ServerMessage,
};
use crate::protocol::MadoraProtocolState;
use crate::services::ai::{self, AiCompletionService};
use crate::services::explorer;
use crate::services::madora_sync::MadoraSyncStore;

/// Handle to a running sync server. Dropping this does not stop the server —
/// the server runs until the process exits or [`SyncServer::stop`] is called
/// via the shared shutdown flag.
pub struct SyncServer;

/// Monotonic generation for sync-server listeners. Restarting increments the
/// generation so older accept loops exit and release their port.
static SERVER_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Spawn the WebSocket server on the Tauri async runtime.
///
/// Only spawns if `sync.enabled && sync.auto_start_server`. The port comes
/// from the sync config (default 3210). If the port is already in use the
/// error is logged and the server simply does not run.
pub fn spawn<R: Runtime>(handle: AppHandle<R>) {
    let config = {
        let store = handle.state::<MadoraSyncStore>();
        match store.get_config() {
            Ok(config) => config,
            Err(error) => {
                eprintln!("[madora-sync] failed to read config: {error}");
                return;
            }
        }
    };

    if !config.enabled || !config.auto_start_server {
        return;
    }

    let port = config.port;
    let generation = SERVER_GENERATION.load(Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        match TcpListener::bind(("0.0.0.0", port)).await {
            Ok(listener) => {
                println!("[madora-sync] server listening on :{port}");
                accept_loop(listener, handle, generation).await;
            }
            Err(error) => {
                eprintln!("[madora-sync] failed to bind port {port}: {error}");
            }
        }
    });
}

/// Signal the accept loop to stop. Existing connections are not forcibly
/// closed — they finish their current request then drop on disconnect.
pub fn stop() {
    SERVER_GENERATION.fetch_add(1, Ordering::SeqCst);
}

async fn accept_loop<R: Runtime>(listener: TcpListener, handle: AppHandle<R>, generation: u64) {
    loop {
        if SERVER_GENERATION.load(Ordering::SeqCst) != generation {
            break;
        }

        // Accept with a short timeout so we can poll the shutdown flag.
        let accept = tokio::time::timeout(Duration::from_millis(250), listener.accept()).await;
        let Ok(result) = accept else {
            continue;
        };

        let Ok((stream, peer)) = result else {
            continue;
        };

        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            match tokio_tungstenite::accept_async(stream).await {
                Ok(ws_stream) => {
                    if let Err(error) = handle_connection(ws_stream, handle, peer).await {
                        eprintln!("[madora-sync] connection error ({peer}): {error}");
                    }
                }
                Err(error) => {
                    eprintln!("[madora-sync] ws handshake failed ({peer}): {error}");
                }
            }
        });
    }

    println!("[madora-sync] server stopped");
}

/// Process a single WebSocket connection: authenticate, then run the message loop.
async fn handle_connection<R: Runtime>(
    mut ws_stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    handle: AppHandle<R>,
    _peer: std::net::SocketAddr,
) -> Result<(), String> {
    // ── Phase 1: Authentication ──────────────────────────────────────────
    let auth_msg = ws_stream
        .next()
        .await
        .ok_or_else(|| "connection closed before auth".to_string())?
        .map_err(|e| format!("ws read error: {e}"))?;

    let auth_text = match auth_msg {
        Message::Text(text) => text,
        Message::Close(_) => return Ok(()),
        _ => return Err("expected text message for auth".to_string()),
    };

    let client_msg: ClientMessage =
        serde_json::from_str(&auth_text).map_err(|e| format!("invalid auth message: {e}"))?;

    let ClientMessage::Auth(auth) = client_msg else {
        let _ = send(
            &mut ws_stream,
            ServerMessage::AuthError(AuthErrorMessage {
                message: "First message must be an auth handshake".to_string(),
            }),
        )
        .await;
        return Err("auth expected as first message".to_string());
    };

    // Validate against the desktop's pairing ticket.
    let device_name_result = {
        let store = handle.state::<MadoraSyncStore>();
        let request = MadoraSyncPairDeviceInput {
            device_id: auth.device_id.clone(),
            device_name: auth.device_name.clone(),
            platform: auth.platform.clone(),
            pairing_id: auth.pairing_id.clone(),
            pairing_token: auth.pairing_token.clone(),
            pairing_code: auth.code.clone(),
        };
        store.authenticate_device(request).map(|device| device.name)
    };

    match device_name_result {
        Ok(name) => {
            send(
                &mut ws_stream,
                ServerMessage::AuthOk(AuthOkMessage { device_name: name }),
            )
            .await?;
        }
        Err(error) => {
            send(
                &mut ws_stream,
                ServerMessage::AuthError(AuthErrorMessage { message: error }),
            )
            .await?;
            let _ = ws_stream.close(None).await;
            return Ok(());
        }
    }

    // ── Phase 2: Message loop ────────────────────────────────────────────
    while let Some(msg_result) = ws_stream.next().await {
        let msg = msg_result.map_err(|e| format!("ws read error: {e}"))?;

        let text = match msg {
            Message::Text(text) => text.to_string(),
            Message::Binary(data) => match String::from_utf8(data.to_vec()) {
                Ok(text) => text,
                Err(_) => continue,
            },
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) => continue,
            Message::Frame(_) => continue,
        };

        let parsed: Result<ClientMessage, _> = serde_json::from_str(&text);
        let message = match parsed {
            Ok(message) => message,
            Err(error) => {
                send(
                    &mut ws_stream,
                    ServerMessage::Error(ErrorMessage {
                        message: format!("invalid message: {error}"),
                        code: None,
                    }),
                )
                .await?;
                continue;
            }
        };

        let response = dispatch(&handle, message).await;
        let _ = send(&mut ws_stream, response).await;
    }

    Ok(())
}

/// Route an authenticated client message to the right handler.
async fn dispatch<R: Runtime>(handle: &AppHandle<R>, message: ClientMessage) -> ServerMessage {
    match message {
        ClientMessage::FileList(msg) => handle_file_list(handle, msg).await,
        ClientMessage::FileRead(msg) => handle_file_read(handle, msg).await,
        ClientMessage::FileWrite(msg) => handle_file_write(handle, msg).await,
        ClientMessage::AiComplete(msg) => handle_ai_complete(handle, msg).await,
        ClientMessage::Auth(_) => ServerMessage::Error(ErrorMessage {
            message: "Already authenticated".to_string(),
            code: None,
        }),
    }
}

// ─── Handlers ────────────────────────────────────────────────────────────

async fn handle_file_list<R: Runtime>(
    handle: &AppHandle<R>,
    msg: FileListMessage,
) -> ServerMessage {
    let Some(root) = get_workspace_root(handle) else {
        return ServerMessage::Error(ErrorMessage {
            message: "No workspace open on the desktop".to_string(),
            code: Some("no_workspace".to_string()),
        });
    };

    let requested_path = msg.path.as_deref().unwrap_or("").to_string();
    let path_for_result = requested_path.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let root_path = PathBuf::from(&root);
        if requested_path.is_empty() || requested_path == "/" {
            explorer::build_workspace_root(&root_path, false, true).map(|node| vec![node])
        } else {
            let dir = PathBuf::from(&requested_path);
            if !is_within_root(&root_path, &dir) {
                return Err("path is outside the workspace".to_string());
            }
            explorer::read_directory_children(&root_path, &dir, false, true)
        }
    })
    .await
    .map_err(|e| e.to_string());

    match result {
        Ok(Ok(tree)) => ServerMessage::FileListResult(FileListResultMessage {
            path: path_for_result,
            tree,
        }),
        Ok(Err(error)) | Err(error) => ServerMessage::Error(ErrorMessage {
            message: error,
            code: None,
        }),
    }
}

async fn handle_file_read<R: Runtime>(
    handle: &AppHandle<R>,
    msg: FileReadMessage,
) -> ServerMessage {
    let Some(root) = get_workspace_root(handle) else {
        return ServerMessage::Error(ErrorMessage {
            message: "No workspace open on the desktop".to_string(),
            code: Some("no_workspace".to_string()),
        });
    };

    let path = msg.path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let root_path = PathBuf::from(&root);
        let file_path = PathBuf::from(&path);
        if !is_within_root(&root_path, &file_path) {
            return Err("path is outside the workspace".to_string());
        }
        explorer::read_workspace_file(&file_path)
    })
    .await
    .map_err(|e| e.to_string());

    match result {
        Ok(Ok(preview)) => ServerMessage::FileReadResult(FileReadResultMessage {
            path: msg.path,
            content: preview.content,
            encoding: preview.encoding,
            image_data_url: preview.image_data_url,
            truncated: preview.truncated,
        }),
        Ok(Err(error)) | Err(error) => ServerMessage::Error(ErrorMessage {
            message: error,
            code: None,
        }),
    }
}

async fn handle_file_write<R: Runtime>(
    handle: &AppHandle<R>,
    msg: FileWriteMessage,
) -> ServerMessage {
    let Some(root) = get_workspace_root(handle) else {
        return ServerMessage::FileWriteResult(FileWriteResultMessage {
            path: msg.path,
            ok: false,
            error: Some("No workspace open on the desktop".to_string()),
        });
    };

    let path = msg.path.clone();
    let content = msg.content.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let root_path = PathBuf::from(&root);
        let file_path = PathBuf::from(&path);
        if !is_within_root(&root_path, &file_path) {
            return Err("path is outside the workspace".to_string());
        }
        explorer::write_workspace_file(&file_path, &content)
    })
    .await
    .map_err(|e| e.to_string());

    match result {
        Ok(Ok(())) => ServerMessage::FileWriteResult(FileWriteResultMessage {
            path: msg.path,
            ok: true,
            error: None,
        }),
        Ok(Err(error)) | Err(error) => ServerMessage::FileWriteResult(FileWriteResultMessage {
            path: msg.path,
            ok: false,
            error: Some(error),
        }),
    }
}

async fn handle_ai_complete<R: Runtime>(
    handle: &AppHandle<R>,
    msg: AiCompleteMessage,
) -> ServerMessage {
    // Check the share_ai_completions gate.
    let share = handle
        .state::<MadoraSyncStore>()
        .get_config()
        .map(|c| c.share_ai_completions)
        .unwrap_or(false);

    if !share {
        return ServerMessage::AiResult(AiResultMessage {
            doc_id: msg.doc_id,
            completion: String::new(),
            error: Some("AI completion sharing is disabled on the desktop".to_string()),
        });
    }

    let provider = AiProvider::default();
    let api_key = match load_api_key(provider) {
        Ok(key) => key,
        Err(error) => {
            return ServerMessage::AiResult(AiResultMessage {
                doc_id: msg.doc_id,
                completion: String::new(),
                error: Some(error),
            });
        }
    };

    let config = AiCompletionConfig {
        api_key,
        ..Default::default()
    };
    let request = CompletionRequest {
        title: msg.title.clone(),
        prefix: msg.prefix.clone(),
        suffix: msg.suffix.clone(),
    };

    let service = handle.state::<AiCompletionService>().inner();
    let doc_id = msg.doc_id.clone();
    match ai::generate_completion(service, &config, &request).await {
        Ok(result) => ServerMessage::AiResult(AiResultMessage {
            doc_id,
            completion: result.text,
            error: None,
        }),
        Err(error) => ServerMessage::AiResult(AiResultMessage {
            doc_id,
            completion: String::new(),
            error: Some(error),
        }),
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

fn get_workspace_root<R: Runtime>(handle: &AppHandle<R>) -> Option<String> {
    handle
        .state::<MadoraProtocolState>()
        .get_workspace_root()
        .map(|p| p.to_string_lossy().into_owned())
}

/// Canonicalize-based containment check (stronger than the lexical
/// `starts_with` used by the explorer, because this path crosses the
/// network boundary).
fn is_within_root(root: &std::path::Path, path: &std::path::Path) -> bool {
    let Ok(canonical_root) = root.canonicalize() else {
        return false;
    };
    let Ok(canonical) = path.canonicalize() else {
        return false;
    };
    canonical == canonical_root || canonical.starts_with(&canonical_root)
}

/// Load an API key from secure storage. Mirrors the logic in
/// `commands::ai::require_api_key` but without the in-process cache.
fn load_api_key(provider: AiProvider) -> Result<String, String> {
    use crate::commands::secure_storage;
    secure_storage::load_ai_api_key_sync(provider)?
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .ok_or_else(|| "No API key configured on the desktop".to_string())
}

async fn send(
    ws: &mut tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    message: ServerMessage,
) -> Result<(), String> {
    ws.send(Message::Text(message.to_json().into()))
        .await
        .map_err(|e| format!("ws send error: {e}"))
}
