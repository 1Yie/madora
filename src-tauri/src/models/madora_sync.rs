use serde::{Deserialize, Serialize};

use crate::models::ai::{AiProvider, CustomProviderProtocol};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MadoraSyncRole {
    #[default]
    Host,
    Client,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MadoraSyncConnectionState {
    #[default]
    Disconnected,
    Discovering,
    Connecting,
    Authenticating,
    Syncing,
    Connected,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MadoraSyncPairedDevice {
    pub id: String,
    pub name: String,
    pub platform: Option<String>,
    pub last_seen_at: Option<String>,
    pub trusted: bool,
    /// SHA-256 hex of the device's auth token. Persisted to disk; never
    /// exposed to the frontend (see [`MadoraSyncPairedDeviceView`]).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_hash: Option<String>,
    /// Legacy plaintext auth token. Only kept so old config files can be
    /// read and migrated to [`Self::token_hash`]; never written back and
    /// never sent to the frontend.
    #[serde(default, skip_serializing)]
    pub auth_token: Option<String>,
}

/// Frontend-facing view of a paired device. Deliberately excludes every
/// token material.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MadoraSyncPairedDeviceView {
    pub id: String,
    pub name: String,
    pub platform: Option<String>,
    pub last_seen_at: Option<String>,
    pub trusted: bool,
}

impl MadoraSyncPairedDevice {
    pub fn to_view(&self) -> MadoraSyncPairedDeviceView {
        MadoraSyncPairedDeviceView {
            id: self.id.clone(),
            name: self.name.clone(),
            platform: self.platform.clone(),
            last_seen_at: self.last_seen_at.clone(),
            trusted: self.trusted,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MadoraSyncAiCompletionConfig {
    pub enabled: bool,
    pub api_url: Option<String>,
    pub custom_protocol: Option<CustomProviderProtocol>,
    pub model: Option<String>,
    pub provider: AiProvider,
    pub use_ssl: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MadoraSyncConfig {
    pub enabled: bool,
    pub role: MadoraSyncRole,
    pub device_name: String,
    pub port: u16,
    pub auto_start_server: bool,
    pub allow_lan_discovery: bool,
    pub share_ai_completions: bool,
    pub connection_state: MadoraSyncConnectionState,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub active_pairing_id: Option<String>,
    pub active_pairing_token: Option<String>,
    pub active_pairing_code: Option<String>,
    pub pairing_code_expires_at: Option<String>,
    pub paired_devices: Vec<MadoraSyncPairedDevice>,
    pub ai_completion_config: Option<MadoraSyncAiCompletionConfig>,
}

/// Frontend-facing view of the persisted sync config. Excludes the active
/// pairing token (a short-lived secret used to authorise a new device) and
/// every per-device token field.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MadoraSyncConfigView {
    pub enabled: bool,
    pub role: MadoraSyncRole,
    pub device_name: String,
    pub port: u16,
    pub auto_start_server: bool,
    pub allow_lan_discovery: bool,
    pub share_ai_completions: bool,
    pub connection_state: MadoraSyncConnectionState,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub active_pairing_id: Option<String>,
    pub active_pairing_code: Option<String>,
    pub pairing_code_expires_at: Option<String>,
    pub paired_devices: Vec<MadoraSyncPairedDeviceView>,
    pub ai_completion_config: Option<MadoraSyncAiCompletionConfig>,
}

impl MadoraSyncConfig {
    pub fn to_view(&self) -> MadoraSyncConfigView {
        MadoraSyncConfigView {
            enabled: self.enabled,
            role: self.role.clone(),
            device_name: self.device_name.clone(),
            port: self.port,
            auto_start_server: self.auto_start_server,
            allow_lan_discovery: self.allow_lan_discovery,
            share_ai_completions: self.share_ai_completions,
            connection_state: self.connection_state.clone(),
            last_sync_at: self.last_sync_at.clone(),
            last_error: self.last_error.clone(),
            active_pairing_id: self.active_pairing_id.clone(),
            active_pairing_code: self.active_pairing_code.clone(),
            pairing_code_expires_at: self.pairing_code_expires_at.clone(),
            paired_devices: self
                .paired_devices
                .iter()
                .map(MadoraSyncPairedDevice::to_view)
                .collect(),
            ai_completion_config: self.ai_completion_config.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MadoraSyncSettingsInput {
    pub enabled: bool,
    pub device_name: String,
    pub port: u16,
    pub auto_start_server: bool,
    pub allow_lan_discovery: bool,
    pub share_ai_completions: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MadoraSyncPairingCode {
    pub code: String,
    pub expires_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MadoraSyncPairingQr {
    pub pairing_id: String,
    pub payload: Option<String>,
    pub available_hosts: Vec<String>,
    pub primary_host: Option<String>,
    pub port: u16,
    pub code: String,
    pub expires_at: String,
    pub device_name: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MadoraSyncPairDeviceInput {
    pub device_id: String,
    pub device_name: String,
    pub platform: Option<String>,
    pub pairing_id: Option<String>,
    pub pairing_token: Option<String>,
    pub pairing_code: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MadoraSyncPairDeviceResult {
    pub device: MadoraSyncPairedDeviceView,
    pub paired_at: String,
}

impl Default for MadoraSyncConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            role: MadoraSyncRole::Host,
            device_name: "Madora Desktop".to_string(),
            port: 3210,
            auto_start_server: true,
            allow_lan_discovery: true,
            share_ai_completions: true,
            connection_state: MadoraSyncConnectionState::Disconnected,
            last_sync_at: None,
            last_error: None,
            active_pairing_id: None,
            active_pairing_token: None,
            active_pairing_code: None,
            pairing_code_expires_at: None,
            paired_devices: Vec::new(),
            ai_completion_config: None,
        }
    }
}

impl Default for MadoraSyncAiCompletionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            api_url: None,
            custom_protocol: None,
            model: None,
            provider: AiProvider::default(),
            use_ssl: true,
        }
    }
}

impl Default for MadoraSyncSettingsInput {
    fn default() -> Self {
        let config = MadoraSyncConfig::default();
        Self {
            enabled: config.enabled,
            device_name: config.device_name,
            port: config.port,
            auto_start_server: config.auto_start_server,
            allow_lan_discovery: config.allow_lan_discovery,
            share_ai_completions: config.share_ai_completions,
        }
    }
}
