//! WebSocket message types for the Madora sync protocol.
//!
//! These types are serialized to JSON and exchanged over the WebSocket
//! connection between the desktop host and mobile clients. The wire format
//! is `{"type": "<variant>", ...fields}`.

use serde::{Deserialize, Serialize};

use crate::models::explorer::ExplorerNode;

// ─── Client → Host messages ─────────────────────────────────────────────

/// Authentication handshake. Must be the first message after connecting.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthMessage {
    pub pairing_id: Option<String>,
    pub pairing_token: Option<String>,
    pub code: Option<String>,
    pub device_id: String,
    pub device_name: String,
    pub platform: Option<String>,
}

/// Request the workspace file tree.
#[derive(Debug, Deserialize)]
pub struct FileListMessage {
    /// Only request files under this sub-path (relative to workspace root).
    /// If empty or "/", the root tree is returned.
    #[serde(default)]
    pub path: Option<String>,
}

/// Read a single file's content.
#[derive(Debug, Deserialize)]
pub struct FileReadMessage {
    pub path: String,
}

/// Write content back to a file (mobile edit synced to desktop).
#[derive(Debug, Deserialize)]
pub struct FileWriteMessage {
    pub path: String,
    pub content: String,
}

/// Request an AI completion from the desktop's configured provider.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompleteMessage {
    pub doc_id: String,
    #[serde(default)]
    pub title: Option<String>,
    pub prefix: String,
    #[serde(default)]
    pub suffix: Option<String>,
}

/// Top-level inbound message envelope.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Auth(AuthMessage),
    FileList(FileListMessage),
    FileRead(FileReadMessage),
    FileWrite(FileWriteMessage),
    AiComplete(AiCompleteMessage),
}

// ─── Host → Client messages ─────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AuthOkMessage {
    pub device_name: String,
}

#[derive(Debug, Serialize)]
pub struct AuthErrorMessage {
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileListResultMessage {
    pub path: String,
    pub tree: Vec<ExplorerNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResultMessage {
    pub path: String,
    pub content: Option<String>,
    pub encoding: Option<String>,
    /// Base64 data URL for image files.
    pub image_data_url: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResultMessage {
    pub path: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResultMessage {
    pub doc_id: String,
    pub completion: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ErrorMessage {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

/// Top-level outbound message envelope.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    AuthOk(AuthOkMessage),
    AuthError(AuthErrorMessage),
    FileListResult(FileListResultMessage),
    FileReadResult(FileReadResultMessage),
    FileWriteResult(FileWriteResultMessage),
    AiResult(AiResultMessage),
    Error(ErrorMessage),
}

impl ServerMessage {
    /// Serialize to a JSON string for sending over WebSocket text frames.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }
}
