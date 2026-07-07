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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,
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
    pub device: MadoraSyncPairedDevice,
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
