//! WebSocket sync server for Madora.
//!
//! Listens on the configured port (default 3210) and serves file-tree,
//! file-content, and AI-completion requests to authenticated mobile clients.
//! Authentication reuses the existing pairing code/token flow in
//! [`MadoraSyncStore`].
//!
//! ## Known limitation: plaintext `ws://` on the LAN
//!
//! The listener binds `0.0.0.0` and speaks unencrypted `ws://`. Adding TLS
//! (`wss://`) requires the mobile client to trust the desktop's certificate,
//! which is a separate client-side change. Mitigations in place: only
//! loopback/private/link-local/ULA peers are accepted (see
//! [`is_allowed_peer`]), pairing is rate-limited, and message size is bounded.
//! Traffic is still visible to anyone on the same LAN.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot, Semaphore};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;

use crate::models::ai::{AiCompletionConfig, AiProvider, CompletionRequest};
use crate::models::madora_sync::MadoraSyncPairDeviceInput;
use crate::models::sync_server::{
    AiCompleteMessage, AiResultMessage, AuthErrorMessage, AuthOkMessage, ClientMessage,
    EditorStateInput, EditorStateMessage, ErrorMessage, FileListMessage, FileListResultMessage,
    FileReadMessage, FileReadResultMessage, FileWriteMessage, FileWriteResultMessage,
    ServerMessage,
};
use crate::protocol::MadoraProtocolState;
use crate::services::ai::{self, AiCompletionService};
use crate::services::api_keys;
use crate::services::explorer;
use crate::services::madora_sync::{sha256_hex, MadoraSyncStore};
use crate::services::paths;

/// Handle to a running sync server. Dropping this does not stop the server —
/// the server runs until the process exits or [`SyncServer::stop`] is called
/// via the shared shutdown flag.
pub struct SyncServer;

/// Maximum number of simultaneously handled WebSocket connections. Further
/// connections are rejected outright rather than queued.
const MAX_CONNECTIONS: usize = 16;
/// Time allowed between TCP accept and the auth handshake message.
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
/// Drop a connection that sees no traffic (inbound or outbound) for this long.
const IDLE_TIMEOUT: Duration = Duration::from_secs(600);
/// Upper bound on a single WebSocket message/frame. Large enough for a full
/// 512 KiB text preview plus JSON/base64 overhead and a 12k-char AI prefix;
/// small enough to cap memory per connection.
const MAX_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
/// AI completion request bounds (characters, not bytes).
const AI_PREFIX_MAX_CHARS: usize = 12_000;
const AI_SUFFIX_MAX_CHARS: usize = 3_000;
/// Error code returned when an optimistic-concurrency write is rejected.
const CONFLICT_CODE: &str = "conflict";

/// Monotonic generation for sync-server listeners. Restarting increments the
/// generation so older accept loops exit and release their port.
static SERVER_GENERATION: AtomicU64 = AtomicU64::new(0);
static CLIENTS: LazyLock<Mutex<Vec<mpsc::UnboundedSender<String>>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

pub const EDITOR_STATE_EVENT: &str = "madora-sync://editor-state";

/// Spawn the WebSocket server on the Tauri async runtime.
///
/// Only spawns if `sync.enabled && sync.auto_start_server`. The port comes
/// from the sync config (default 3210). If the port is already in use the
/// error is logged and the server simply does not run.
pub fn spawn<R: Runtime>(handle: AppHandle<R>) {
    spawn_inner(handle, None);
}

/// Spawn the server and wait for the bind result. Used by the restart command
/// so a failed bind can be reported to the UI instead of silently appearing
/// started.
pub async fn spawn_checked<R: Runtime>(handle: AppHandle<R>) -> Result<(), String> {
    let (bind_tx, bind_rx) = oneshot::channel();
    spawn_inner(handle, Some(bind_tx));

    bind_rx
        .await
        .map_err(|_| "sync server task ended before reporting its bind result".to_string())?
}

fn spawn_inner<R: Runtime>(
    handle: AppHandle<R>,
    bind_result: Option<oneshot::Sender<Result<(), String>>>,
) {
    let config = {
        let store = handle.state::<MadoraSyncStore>();
        match store.get_config() {
            Ok(config) => config,
            Err(error) => {
                eprintln!("[madora-sync] failed to read config: {error}");
                if let Some(tx) = bind_result {
                    let _ = tx.send(Err(format!("failed to read sync config: {error}")));
                }
                return;
            }
        }
    };

    if !config.enabled || !config.auto_start_server {
        if let Some(tx) = bind_result {
            let _ = tx.send(Ok(()));
        }
        return;
    }

    let port = config.port;
    let generation = SERVER_GENERATION.load(Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        match TcpListener::bind(("0.0.0.0", port)).await {
            Ok(listener) => {
                println!("[madora-sync] server listening on :{port}");
                if let Some(tx) = bind_result {
                    let _ = tx.send(Ok(()));
                }
                accept_loop(listener, handle, generation).await;
            }
            Err(error) => {
                let message = format!("failed to bind sync server port {port}: {error}");
                eprintln!("[madora-sync] {message}");
                if let Some(tx) = bind_result {
                    let _ = tx.send(Err(message));
                }
            }
        }
    });
}

/// Signal the accept loop to stop. Existing connections are not forcibly
/// closed — they finish their current request then drop on disconnect.
pub fn stop() {
    SERVER_GENERATION.fetch_add(1, Ordering::SeqCst);
}

/// Whether a peer address is allowed to talk to the sync server.
///
/// Only loopback, RFC1918 private, link-local, IPv6 ULA, and IPv4-mapped
/// equivalents are accepted. Public addresses are disconnected immediately.
/// Kept as a pure function so the policy is directly testable.
pub(crate) fn is_allowed_peer(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_allowed_ipv4(v4),
        IpAddr::V6(v6) => {
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return is_allowed_ipv4(mapped);
            }
            v6.is_loopback() || v6.is_unique_local() || v6.is_unicast_link_local()
        }
    }
}

fn is_allowed_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_loopback() || ip.is_private() || ip.is_link_local()
}

async fn accept_loop<R: Runtime>(listener: TcpListener, handle: AppHandle<R>, generation: u64) {
    let semaphore = Arc::new(Semaphore::new(MAX_CONNECTIONS));

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

        if !is_allowed_peer(peer.ip()) {
            eprintln!("[madora-sync] rejected non-LAN peer {peer}");
            continue;
        }

        let Ok(permit) = semaphore.clone().try_acquire_owned() else {
            eprintln!("[madora-sync] connection limit reached; rejecting {peer}");
            continue;
        };

        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            let _permit = permit;

            let ws_config = WebSocketConfig::default()
                .max_message_size(Some(MAX_MESSAGE_BYTES))
                .max_frame_size(Some(MAX_MESSAGE_BYTES));

            match tokio::time::timeout(
                AUTH_TIMEOUT,
                tokio_tungstenite::accept_async_with_config(stream, Some(ws_config)),
            )
            .await
            {
                Ok(Ok(ws_stream)) => {
                    if let Err(error) = handle_connection(ws_stream, handle, peer).await {
                        eprintln!("[madora-sync] connection error ({peer}): {error}");
                    }
                }
                Ok(Err(error)) => {
                    eprintln!("[madora-sync] ws handshake failed ({peer}): {error}");
                }
                Err(_) => {
                    eprintln!("[madora-sync] ws handshake timed out ({peer})");
                }
            }
        });
    }

    println!("[madora-sync] server stopped");
}

/// Process a single WebSocket connection: authenticate, then run the message loop.
async fn handle_connection<R: Runtime>(
    ws_stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    handle: AppHandle<R>,
    peer: SocketAddr,
) -> Result<(), String> {
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // ── Phase 1: Authentication ──────────────────────────────────────────
    let auth_msg = tokio::time::timeout(AUTH_TIMEOUT, ws_receiver.next())
        .await
        .map_err(|_| "authentication timed out".to_string())?
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
            &mut ws_sender,
            ServerMessage::AuthError(AuthErrorMessage {
                message: "First message must be an auth handshake".to_string(),
            }),
        )
        .await;
        return Err("auth expected as first message".to_string());
    };

    // Validate against the desktop's pairing ticket. Attempts are rate-limited
    // per source IP inside the store.
    let auth_result = {
        let store = handle.state::<MadoraSyncStore>();
        let request = MadoraSyncPairDeviceInput {
            device_id: auth.device_id.clone(),
            device_name: auth.device_name.clone(),
            platform: auth.platform.clone(),
            pairing_id: auth.pairing_id.clone(),
            pairing_token: auth.pairing_token.clone(),
            pairing_code: auth.code.clone(),
        };
        store
            .authenticate_device(request, peer.ip())
            .and_then(|outcome| {
                let sync_config = store.get_config()?;
                Ok((
                    outcome,
                    sync_config.device_name,
                    sync_config.share_ai_completions,
                ))
            })
    };

    match auth_result {
        Ok((outcome, host_device_name, share_ai_completions)) => {
            send(
                &mut ws_sender,
                ServerMessage::AuthOk(AuthOkMessage {
                    device_name: outcome.device.name,
                    share_ai_completions,
                    host_device_name: Some(host_device_name),
                    pairing_token: Some(outcome.auth_token),
                }),
            )
            .await?;
        }
        Err(error) => {
            send(
                &mut ws_sender,
                ServerMessage::AuthError(AuthErrorMessage { message: error }),
            )
            .await?;
            let _ = ws_sender.close().await;
            return Ok(());
        }
    }

    let (outgoing_tx, mut outgoing_rx) = mpsc::unbounded_channel::<String>();
    register_client(outgoing_tx.clone());

    // ── Phase 2: Message loop ────────────────────────────────────────────
    loop {
        let event = match tokio::time::timeout(IDLE_TIMEOUT, async {
            tokio::select! {
                inbound = ws_receiver.next() => LoopEvent::Inbound(inbound),
                outbound = outgoing_rx.recv() => LoopEvent::Outbound(outbound),
            }
        })
        .await
        {
            Ok(event) => event,
            // No traffic for IDLE_TIMEOUT: close the connection.
            Err(_) => break,
        };

        match event {
            LoopEvent::Inbound(inbound) => {
                let Some(msg_result) = inbound else {
                    break;
                };

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
                            &mut ws_sender,
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
                let _ = send(&mut ws_sender, response).await;
            }
            LoopEvent::Outbound(outbound) => {
                let Some(message) = outbound else {
                    break;
                };

                send_json(&mut ws_sender, message).await?;
            }
        }
    }

    Ok(())
}

enum LoopEvent {
    Inbound(Option<Result<Message, tokio_tungstenite::tungstenite::Error>>),
    Outbound(Option<String>),
}

/// Route an authenticated client message to the right handler.
async fn dispatch<R: Runtime>(handle: &AppHandle<R>, message: ClientMessage) -> ServerMessage {
    match message {
        ClientMessage::FileList(msg) => handle_file_list(handle, msg).await,
        ClientMessage::FileRead(msg) => handle_file_read(handle, msg).await,
        ClientMessage::FileWrite(msg) => handle_file_write(handle, msg).await,
        ClientMessage::AiComplete(msg) => handle_ai_complete(handle, msg).await,
        ClientMessage::EditorState(msg) => handle_editor_state(handle, msg).await,
        ClientMessage::Auth(_) => ServerMessage::Error(ErrorMessage {
            message: "Already authenticated".to_string(),
            code: None,
        }),
    }
}

async fn handle_editor_state<R: Runtime>(
    handle: &AppHandle<R>,
    mut msg: EditorStateMessage,
) -> ServerMessage {
    msg.updated_at = current_timestamp_ms();

    if let (Some(file_path), Some(content)) = (msg.file_path.clone(), msg.content.clone()) {
        if let Err(error) = write_synced_file(handle, file_path, content).await {
            return ServerMessage::Error(ErrorMessage {
                message: error,
                code: None,
            });
        }
    }

    let _ = handle.emit(EDITOR_STATE_EVENT, msg.clone());
    broadcast(ServerMessage::EditorState(msg.clone()).to_json());
    ServerMessage::EditorState(msg)
}

pub fn publish_desktop_editor_state<R: Runtime>(
    handle: &AppHandle<R>,
    input: EditorStateInput,
) -> Result<(), String> {
    // A document window has no sync store: nobody to publish to.
    let Some(store) = handle.try_state::<MadoraSyncStore>() else {
        return Ok(());
    };
    let config = store.get_config().map_err(|error| error.to_string())?;

    let state = EditorStateMessage {
        device_id: "desktop".to_string(),
        device_name: config.device_name,
        source: "desktop".to_string(),
        file_path: input.file_path,
        title: input.title,
        content: input.content,
        content_hash: input.content_hash,
        line: input.line,
        column: input.column,
        cursor_index: input.cursor_index,
        editing: input.editing,
        updated_at: current_timestamp_ms(),
    };

    broadcast(ServerMessage::EditorState(state).to_json());
    Ok(())
}

async fn write_synced_file<R: Runtime>(
    handle: &AppHandle<R>,
    path: String,
    content: String,
) -> Result<(), String> {
    let Some(root) = get_workspace_root(handle) else {
        return Err("No workspace open on the desktop".to_string());
    };

    tauri::async_runtime::spawn_blocking(move || {
        let root_path = PathBuf::from(&root);
        let file_path = PathBuf::from(&path);
        if !is_within_root(&root_path, &file_path) {
            return Err("path is outside the workspace".to_string());
        }
        explorer::write_workspace_file(&file_path, &content)
    })
    .await
    .map_err(|e| e.to_string())?
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
        Ok(Ok(preview)) => {
            let content_hash = preview
                .content
                .as_deref()
                .map(|content| sha256_hex(content.as_bytes()));

            ServerMessage::FileReadResult(FileReadResultMessage {
                path: msg.path,
                content: preview.content,
                encoding: preview.encoding,
                image_data_url: preview.image_data_url,
                truncated: preview.truncated,
                content_hash,
            })
        }
        Ok(Err(error)) | Err(error) => ServerMessage::Error(ErrorMessage {
            message: error,
            code: None,
        }),
    }
}

struct FileWriteFailure {
    message: String,
    code: Option<String>,
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
            code: None,
        });
    };

    let path = msg.path.clone();
    let content = msg.content.clone();
    let expected_hash = msg.expected_hash.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let root_path = PathBuf::from(&root);
        let file_path = PathBuf::from(&path);
        if !is_within_root(&root_path, &file_path) {
            return Err(FileWriteFailure {
                message: "path is outside the workspace".to_string(),
                code: None,
            });
        }

        // Optional optimistic-concurrency guard. Clients that omit
        // `expectedHash` keep the old (potentially destructive) overwrite
        // behaviour; newer clients get conflict detection.
        if let Some(expected_hash) = expected_hash {
            match explorer::read_workspace_file(&file_path) {
                Ok(preview) => {
                    let Some(current) = preview.content else {
                        return Err(FileWriteFailure {
                            message: "cannot verify the current file content".to_string(),
                            code: Some(CONFLICT_CODE.to_string()),
                        });
                    };
                    if sha256_hex(current.as_bytes()) != expected_hash {
                        return Err(FileWriteFailure {
                            message:
                                "file changed on the desktop since it was read; reload before writing"
                                    .to_string(),
                            code: Some(CONFLICT_CODE.to_string()),
                        });
                    }
                }
                Err(_) => {
                    return Err(FileWriteFailure {
                        message: "file no longer exists on the desktop".to_string(),
                        code: Some(CONFLICT_CODE.to_string()),
                    });
                }
            }
        }

        explorer::write_workspace_file(&file_path, &content).map_err(|error| FileWriteFailure {
            message: error,
            code: None,
        })
    })
    .await
    .map_err(|e| e.to_string());

    match result {
        Ok(Ok(())) => ServerMessage::FileWriteResult(FileWriteResultMessage {
            path: msg.path,
            ok: true,
            error: None,
            code: None,
        }),
        Ok(Err(failure)) => ServerMessage::FileWriteResult(FileWriteResultMessage {
            path: msg.path,
            ok: false,
            error: Some(failure.message),
            code: failure.code,
        }),
        Err(error) => ServerMessage::FileWriteResult(FileWriteResultMessage {
            path: msg.path,
            ok: false,
            error: Some(error),
            code: None,
        }),
    }
}

async fn handle_ai_complete<R: Runtime>(
    handle: &AppHandle<R>,
    msg: AiCompleteMessage,
) -> ServerMessage {
    let sync_config = match handle.state::<MadoraSyncStore>().get_config() {
        Ok(config) => config,
        Err(error) => {
            return ServerMessage::AiResult(AiResultMessage {
                doc_id: msg.doc_id,
                completion: String::new(),
                error: Some(error),
            });
        }
    };

    if !sync_config.share_ai_completions {
        return ServerMessage::AiResult(AiResultMessage {
            doc_id: msg.doc_id,
            completion: String::new(),
            error: Some("AI completion sharing is disabled on the desktop".to_string()),
        });
    }

    let shared_ai_config = sync_config.ai_completion_config.unwrap_or_default();
    if !shared_ai_config.enabled {
        return ServerMessage::AiResult(AiResultMessage {
            doc_id: msg.doc_id,
            completion: String::new(),
            error: Some("AI completion is disabled on the desktop".to_string()),
        });
    }

    let provider = shared_ai_config.provider;
    let api_key = match load_api_key(provider).await {
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
        api_url: shared_ai_config.api_url,
        custom_protocol: shared_ai_config.custom_protocol,
        model: shared_ai_config.model,
        provider: Some(provider),
        use_ssl: shared_ai_config.use_ssl,
    };

    // Bound the prompt: a paired device must not be able to send unbounded
    // text that inflates memory and token cost. Truncate on char boundaries.
    let request = CompletionRequest {
        title: msg.title.clone(),
        prefix: truncate_prefix(&msg.prefix, AI_PREFIX_MAX_CHARS),
        suffix: msg
            .suffix
            .as_deref()
            .map(|suffix| truncate_suffix(suffix, AI_SUFFIX_MAX_CHARS)),
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

/// Keep at most `max_chars` characters from the end of a FIM prefix.
fn truncate_prefix(value: &str, max_chars: usize) -> String {
    let char_count = value.chars().count();
    if char_count <= max_chars {
        return value.to_string();
    }

    value.chars().skip(char_count - max_chars).collect()
}

/// Keep at most `max_chars` characters from the start of a FIM suffix.
fn truncate_suffix(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

/// Whether `path` stays inside the workspace and is not VCS/SSH internals.
///
/// This path crosses the network boundary, so it uses the shared
/// canonicalisation-based check (`services::paths`): symlinks are followed,
/// `..` is resolved, and a not-yet-existing target is judged by its nearest
/// existing ancestor.
fn is_within_root(root: &Path, path: &Path) -> bool {
    let Ok(resolved) = paths::ensure_within(root, path) else {
        return false;
    };
    let Ok(canonical_root) = root.canonicalize() else {
        return false;
    };

    resolved
        .strip_prefix(&canonical_root)
        .is_ok_and(|relative| !paths::is_protected_path(relative))
}

/// The desktop's key for a completion requested by a paired device.
///
/// The message is a wire-protocol string the phone shows, so it stays separate
/// from the desktop wording in `api_keys::require_async`.
async fn load_api_key(provider: AiProvider) -> Result<String, String> {
    match api_keys::lookup_async(provider).await? {
        Some(key) => Ok(key),
        None => Err("No API key configured on the desktop".to_string()),
    }
}

async fn send(
    ws: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    message: ServerMessage,
) -> Result<(), String> {
    ws.send(Message::Text(message.to_json().into()))
        .await
        .map_err(|e| format!("ws send error: {e}"))
}

async fn send_json(
    ws: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    message: String,
) -> Result<(), String> {
    ws.send(Message::Text(message.into()))
        .await
        .map_err(|e| format!("ws send error: {e}"))
}

fn register_client(sender: mpsc::UnboundedSender<String>) {
    let Ok(mut clients) = CLIENTS.lock() else {
        return;
    };

    clients.retain(|client| !client.is_closed());
    clients.push(sender);
}

fn broadcast(message: String) {
    let Ok(mut clients) = CLIENTS.lock() else {
        return;
    };

    clients.retain(|client| {
        if client.is_closed() {
            return false;
        }

        client.send(message.clone()).is_ok()
    });
}

fn current_timestamp_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv6Addr;

    #[test]
    fn allows_loopback_peers() {
        assert!(is_allowed_peer(IpAddr::V4(Ipv4Addr::LOCALHOST)));
        assert!(is_allowed_peer(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_allowed_peer("127.255.255.254".parse().unwrap()));
    }

    #[test]
    fn allows_private_ranges() {
        for peer in [
            "10.0.0.1",
            "10.255.255.255",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.0.1",
            "192.168.255.254",
        ] {
            assert!(
                is_allowed_peer(peer.parse().unwrap()),
                "{peer} should be allowed"
            );
        }
    }

    #[test]
    fn rejects_public_and_boundary_private_addresses() {
        for peer in [
            "8.8.8.8",
            "172.15.255.255",
            "172.32.0.1",
            "192.169.0.1",
            "11.0.0.1",
            "100.64.0.1",
            "0.0.0.0",
        ] {
            assert!(
                !is_allowed_peer(peer.parse().unwrap()),
                "{peer} should be rejected"
            );
        }
    }

    #[test]
    fn allows_link_local_and_ula() {
        assert!(is_allowed_peer("169.254.10.20".parse().unwrap()));
        assert!(is_allowed_peer("fe80::1".parse().unwrap()));
        assert!(is_allowed_peer("fc00::1".parse().unwrap()));
        assert!(is_allowed_peer("fd12:3456::1".parse().unwrap()));
        assert!(!is_allowed_peer("2001:db8::1".parse().unwrap()));
    }

    #[test]
    fn allows_ipv4_mapped_private_peers() {
        assert!(is_allowed_peer("::ffff:192.168.1.5".parse().unwrap()));
        assert!(!is_allowed_peer("::ffff:8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn truncates_prefix_keeping_the_tail() {
        assert_eq!(truncate_prefix("abcdef", 3), "def");
        assert_eq!(truncate_prefix("abc", 3), "abc");
        assert_eq!(truncate_prefix("", 3), "");
    }

    #[test]
    fn truncates_suffix_keeping_the_head() {
        assert_eq!(truncate_suffix("abcdef", 3), "abc");
        assert_eq!(truncate_suffix("abc", 3), "abc");
        assert_eq!(truncate_suffix("", 3), "");
    }

    #[test]
    fn truncation_respects_utf8_boundaries() {
        let chinese = "你好世界这是一段中文";
        let prefix = truncate_prefix(chinese, 3);
        assert_eq!(prefix, "段中文");
        assert_eq!(prefix.chars().count(), 3);

        let suffix = truncate_suffix(chinese, 2);
        assert_eq!(suffix, "你好");
        assert_eq!(suffix.chars().count(), 2);

        let emoji = "a😀b😀c😀";
        let truncated_prefix = truncate_prefix(emoji, 2);
        assert_eq!(truncated_prefix, "c😀");
        let truncated_suffix = truncate_suffix(emoji, 2);
        assert_eq!(truncated_suffix, "a😀");
    }

    #[test]
    fn ai_bounds_are_character_based() {
        let prefix: String = "中".repeat(AI_PREFIX_MAX_CHARS + 500);
        assert_eq!(
            truncate_prefix(&prefix, AI_PREFIX_MAX_CHARS)
                .chars()
                .count(),
            AI_PREFIX_MAX_CHARS
        );

        let suffix: String = "😀".repeat(AI_SUFFIX_MAX_CHARS + 10);
        assert_eq!(
            truncate_suffix(&suffix, AI_SUFFIX_MAX_CHARS)
                .chars()
                .count(),
            AI_SUFFIX_MAX_CHARS
        );
    }

    #[test]
    fn accepts_existing_file_inside_root() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path();
        let file = root.join("note.md");
        std::fs::write(&file, "hello").unwrap();

        assert!(is_within_root(root, &file));
        assert!(is_within_root(root, root));
    }

    #[test]
    fn accepts_nonexistent_file_inside_root() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path();
        std::fs::create_dir_all(root.join("notes")).unwrap();

        assert!(is_within_root(root, &root.join("new.md")));
        assert!(is_within_root(root, &root.join("notes/new.md")));
    }

    #[test]
    fn rejects_parent_directory_escape() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("workspace");
        std::fs::create_dir_all(&root).unwrap();
        let outside = temp.path().join("secret.md");
        std::fs::write(&outside, "secret").unwrap();

        assert!(!is_within_root(&root, &root.join("../secret.md")));
        assert!(!is_within_root(&root, &root.join("notes/../../secret.md")));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("workspace");
        let outside = temp.path().join("outside");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.md"), "secret").unwrap();
        symlink(&outside, root.join("link")).unwrap();

        // Existing file reached through the symlink.
        assert!(!is_within_root(&root, &root.join("link/secret.md")));
        // New file that would be created through the symlink.
        assert!(!is_within_root(&root, &root.join("link/new.md")));
    }

    #[test]
    fn rejects_absolute_path_outside_root() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("workspace");
        std::fs::create_dir_all(&root).unwrap();

        let outside = std::env::temp_dir().join("madora-outside-check.txt");
        assert!(!is_within_root(&root, &outside));
    }

    #[test]
    fn content_hash_matches_shared_helper() {
        assert_eq!(
            sha256_hex("hello".as_bytes()),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }
}
