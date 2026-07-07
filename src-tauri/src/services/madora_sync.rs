use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{Duration, Utc};

use crate::models::madora_sync::{
    MadoraSyncAiCompletionConfig, MadoraSyncConfig, MadoraSyncConnectionState,
    MadoraSyncPairDeviceInput, MadoraSyncPairDeviceResult, MadoraSyncPairedDevice,
    MadoraSyncPairingCode, MadoraSyncPairingQr, MadoraSyncSettingsInput,
};

const CONFIG_FILE_NAME: &str = "madora_sync_state.json";

pub struct MadoraSyncStore {
    config: Mutex<MadoraSyncConfig>,
    app_data_dir: PathBuf,
}

impl MadoraSyncStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let config = Self::load_config(&app_data_dir);
        Self {
            config: Mutex::new(config),
            app_data_dir,
        }
    }

    fn config_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join(CONFIG_FILE_NAME)
    }

    fn load_config(app_data_dir: &PathBuf) -> MadoraSyncConfig {
        let path = Self::config_path(app_data_dir);
        if !path.exists() {
            return MadoraSyncConfig::default();
        }

        match std::fs::read_to_string(&path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => MadoraSyncConfig::default(),
        }
    }

    fn save_config_inner(app_data_dir: &PathBuf, config: &MadoraSyncConfig) {
        let path = Self::config_path(app_data_dir);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(config) {
            let _ = std::fs::write(&path, json);
        }
    }

    fn clear_active_pairing(config: &mut MadoraSyncConfig) {
        config.active_pairing_id = None;
        config.active_pairing_token = None;
        config.active_pairing_code = None;
        config.pairing_code_expires_at = None;
    }

    fn expire_pairing_code_if_needed(config: &mut MadoraSyncConfig) -> bool {
        let Some(expires_at) = config.pairing_code_expires_at.as_deref() else {
            return false;
        };

        let Ok(expires_at) = chrono::DateTime::parse_from_rfc3339(expires_at) else {
            return false;
        };

        if expires_at.with_timezone(&Utc) > Utc::now() {
            return false;
        }

        Self::clear_active_pairing(config);
        true
    }

    fn read_config_snapshot(&self) -> Result<MadoraSyncConfig, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        let changed = Self::expire_pairing_code_if_needed(&mut guard);
        let snapshot = guard.clone();
        if changed {
            Self::save_config_inner(&self.app_data_dir, &snapshot);
        }
        Ok(snapshot)
    }

    pub fn get_config(&self) -> Result<MadoraSyncConfig, String> {
        self.read_config_snapshot()
    }

    pub fn save_settings(
        &self,
        settings: MadoraSyncSettingsInput,
    ) -> Result<MadoraSyncConfig, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        guard.enabled = settings.enabled;
        guard.device_name = settings.device_name.trim().to_string();
        guard.port = settings.port;
        guard.auto_start_server = settings.auto_start_server;
        guard.allow_lan_discovery = settings.allow_lan_discovery;
        guard.share_ai_completions = settings.share_ai_completions;
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);
        Ok(snapshot)
    }

    pub fn save_ai_completion_config(
        &self,
        config: MadoraSyncAiCompletionConfig,
    ) -> Result<MadoraSyncConfig, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        guard.ai_completion_config = Some(config);
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);
        Ok(snapshot)
    }

    pub fn issue_pairing_code(&self) -> Result<MadoraSyncPairingCode, String> {
        let code = generate_pairing_code()?;
        let expires_at = (Utc::now() + Duration::minutes(10)).to_rfc3339();
        let pairing_id = generate_pairing_secret(12)?;
        let pairing_token = generate_pairing_secret(24)?;

        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        guard.active_pairing_id = Some(pairing_id);
        guard.active_pairing_token = Some(pairing_token);
        guard.active_pairing_code = Some(code.clone());
        guard.pairing_code_expires_at = Some(expires_at.clone());
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);

        Ok(MadoraSyncPairingCode { code, expires_at })
    }

    pub fn get_pairing_qr(&self) -> Result<MadoraSyncPairingQr, String> {
        let mut config = self.get_config()?;
        if config.active_pairing_code.is_none() || config.pairing_code_expires_at.is_none() {
            let _ = self.issue_pairing_code()?;
            config = self.get_config()?;
        }

        let pairing = match (
            config.active_pairing_code.clone(),
            config.pairing_code_expires_at.clone(),
            config.active_pairing_id.clone(),
            config.active_pairing_token.clone(),
        ) {
            (Some(code), Some(expires_at), Some(pairing_id), Some(pairing_token)) => (
                MadoraSyncPairingCode { code, expires_at },
                pairing_id,
                pairing_token,
            ),
            _ => return Err("No active pairing ticket".to_string()),
        };

        let available_hosts = detect_lan_ipv4_candidates();
        let primary_host = available_hosts.first().cloned();
        let payload = primary_host.as_deref().map(|host| {
            build_pairing_payload(
                host,
                config.port,
                &pairing.1,
                &pairing.2,
                &pairing.0.code,
                &config.device_name,
                &pairing.0.expires_at,
            )
        });

        Ok(MadoraSyncPairingQr {
            pairing_id: pairing.1,
            payload,
            available_hosts,
            primary_host,
            port: config.port,
            code: pairing.0.code,
            expires_at: pairing.0.expires_at,
            device_name: config.device_name,
        })
    }

    pub fn clear_pairing_code(&self) -> Result<MadoraSyncConfig, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        Self::clear_active_pairing(&mut guard);
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);
        Ok(snapshot)
    }

    pub fn pair_device(
        &self,
        request: MadoraSyncPairDeviceInput,
    ) -> Result<MadoraSyncPairDeviceResult, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        let _ = Self::expire_pairing_code_if_needed(&mut guard);

        let device_id = request.device_id.trim();
        let device_name = request.device_name.trim();
        if device_id.is_empty() {
            return Err("deviceId is required".to_string());
        }
        if device_name.is_empty() {
            return Err("deviceName is required".to_string());
        }

        let expected_pairing_id = guard
            .active_pairing_id
            .as_deref()
            .ok_or_else(|| "No active pairing ticket".to_string())?;
        let expected_pairing_token = guard
            .active_pairing_token
            .as_deref()
            .ok_or_else(|| "No active pairing token".to_string())?;
        let expected_pairing_code = guard.active_pairing_code.as_deref();

        let token_matches = request
            .pairing_token
            .as_deref()
            .map(str::trim)
            .is_some_and(|token| token == expected_pairing_token);
        let provided_pairing_code = request.pairing_code.as_deref().map(str::trim);
        let pairing_code_present = provided_pairing_code.is_some_and(|code| !code.is_empty());
        let fallback_code_matches = match (provided_pairing_code, expected_pairing_code) {
            (Some(code), Some(expected)) => code == expected,
            _ => false,
        };

        let pairing_id = request
            .pairing_id
            .as_deref()
            .map(str::trim)
            .filter(|pairing_id| !pairing_id.is_empty());
        match pairing_id {
            Some(pairing_id) if pairing_id != expected_pairing_id => {
                return Err("Pairing ticket is invalid".to_string());
            }
            Some(_) => {}
            None if !pairing_code_present => {
                return Err("pairingId is required".to_string());
            }
            None => {}
        }

        if !token_matches && !fallback_code_matches {
            return Err("Pairing credentials are invalid".to_string());
        }

        let paired_at = Utc::now().to_rfc3339();
        let device = MadoraSyncPairedDevice {
            id: device_id.to_string(),
            name: device_name.to_string(),
            platform: request.platform.and_then(|platform| {
                let trimmed = platform.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }),
            last_seen_at: Some(paired_at.clone()),
            trusted: true,
            auth_token: Some(expected_pairing_token.to_string()),
        };

        guard
            .paired_devices
            .retain(|existing| existing.id != device.id);
        guard.paired_devices.push(device.clone());
        Self::clear_active_pairing(&mut guard);
        guard.connection_state = MadoraSyncConnectionState::Connected;
        guard.last_sync_at = Some(paired_at.clone());
        guard.last_error = None;
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);

        Ok(MadoraSyncPairDeviceResult { device, paired_at })
    }

    pub fn authenticate_device(
        &self,
        request: MadoraSyncPairDeviceInput,
    ) -> Result<MadoraSyncPairedDevice, String> {
        match self.touch_paired_device(&request) {
            Ok(device) => Ok(device),
            Err(trusted_error) => match self.pair_device(request) {
                Ok(result) => Ok(result.device),
                Err(pairing_error) => Err(if trusted_error == "Device is not paired" {
                    pairing_error
                } else {
                    trusted_error
                }),
            },
        }
    }

    fn touch_paired_device(
        &self,
        request: &MadoraSyncPairDeviceInput,
    ) -> Result<MadoraSyncPairedDevice, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        let device_id = request.device_id.trim();
        if device_id.is_empty() {
            return Err("deviceId is required".to_string());
        }

        let Some(index) = guard
            .paired_devices
            .iter()
            .position(|device| device.id == device_id)
        else {
            return Err("Device is not paired".to_string());
        };

        let device = &mut guard.paired_devices[index];
        if !device.trusted {
            return Err("Device is not trusted".to_string());
        }

        let Some(stored_token) = device.auth_token.as_deref() else {
            return Err("Device needs to be paired again".to_string());
        };

        let token_matches = request
            .pairing_token
            .as_deref()
            .map(str::trim)
            .is_some_and(|token| token == stored_token);
        if !token_matches {
            return Err("Device credentials are invalid".to_string());
        }

        let now = Utc::now().to_rfc3339();
        let device_name = request.device_name.trim();
        if !device_name.is_empty() {
            device.name = device_name.to_string();
        }
        device.platform = request.platform.as_ref().and_then(|platform| {
            let trimmed = platform.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        device.last_seen_at = Some(now.clone());

        let snapshot_device = device.clone();
        guard.connection_state = MadoraSyncConnectionState::Connected;
        guard.last_sync_at = Some(now);
        guard.last_error = None;
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);

        Ok(snapshot_device)
    }

    pub fn remove_paired_device(&self, device_id: &str) -> Result<MadoraSyncConfig, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        guard.paired_devices.retain(|device| device.id != device_id);
        if guard.paired_devices.is_empty() {
            guard.connection_state = MadoraSyncConnectionState::Disconnected;
        }
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);
        Ok(snapshot)
    }
}

fn detect_lan_ipv4_candidates() -> Vec<String> {
    use std::collections::BTreeSet;
    use std::net::{IpAddr, UdpSocket};

    let mut hosts = BTreeSet::new();
    let probe_targets = [
        "8.8.8.8:80",
        "1.1.1.1:80",
        "192.168.1.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
    ];

    for target in probe_targets {
        let Ok(socket) = UdpSocket::bind("0.0.0.0:0") else {
            continue;
        };
        if socket.connect(target).is_err() {
            continue;
        }
        let Ok(local_addr) = socket.local_addr() else {
            continue;
        };

        let IpAddr::V4(ipv4) = local_addr.ip() else {
            continue;
        };

        if ipv4.is_loopback() || ipv4.is_link_local() || ipv4.is_unspecified() {
            continue;
        }

        hosts.insert(ipv4.to_string());
    }

    hosts.into_iter().collect()
}

fn build_pairing_payload(
    host: &str,
    port: u16,
    pairing_id: &str,
    pairing_token: &str,
    code: &str,
    device_name: &str,
    expires_at: &str,
) -> String {
    format!(
        "madora-sync://pair?host={host}&port={port}&pairingId={pairing_id}&pairingToken={pairing_token}&code={code}&deviceName={device_name}&expiresAt={expires_at}",
        host = urlencoding::encode(host),
        port = port,
        pairing_id = urlencoding::encode(pairing_id),
        pairing_token = urlencoding::encode(pairing_token),
        code = urlencoding::encode(code),
        device_name = urlencoding::encode(device_name),
        expires_at = urlencoding::encode(expires_at),
    )
}

fn generate_pairing_code() -> Result<String, String> {
    let mut random = [0_u8; 4];
    getrandom::getrandom(&mut random).map_err(|e| e.to_string())?;
    Ok(format!("{:06}", u32::from_le_bytes(random) % 1_000_000))
}

fn generate_pairing_secret(byte_len: usize) -> Result<String, String> {
    let mut bytes = vec![0_u8; byte_len];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expires_stale_pairing_code() {
        let mut config = MadoraSyncConfig {
            active_pairing_id: Some("pairing-id".to_string()),
            active_pairing_token: Some("pairing-token".to_string()),
            active_pairing_code: Some("123456".to_string()),
            pairing_code_expires_at: Some((Utc::now() - Duration::minutes(1)).to_rfc3339()),
            ..Default::default()
        };

        assert!(MadoraSyncStore::expire_pairing_code_if_needed(&mut config));
        assert_eq!(config.active_pairing_id, None);
        assert_eq!(config.active_pairing_token, None);
        assert_eq!(config.active_pairing_code, None);
        assert_eq!(config.pairing_code_expires_at, None);
    }

    #[test]
    fn keeps_live_pairing_code() {
        let mut config = MadoraSyncConfig {
            active_pairing_id: Some("pairing-id".to_string()),
            active_pairing_token: Some("pairing-token".to_string()),
            active_pairing_code: Some("123456".to_string()),
            pairing_code_expires_at: Some((Utc::now() + Duration::minutes(1)).to_rfc3339()),
            ..Default::default()
        };

        assert!(!MadoraSyncStore::expire_pairing_code_if_needed(&mut config));
        assert_eq!(config.active_pairing_code.as_deref(), Some("123456"));
    }

    #[test]
    fn builds_pairing_payload_uri() {
        let payload = build_pairing_payload(
            "192.168.1.10",
            3210,
            "pairing-id",
            "pairing-token",
            "123456",
            "Madora Desktop",
            "2026-07-01T00:00:00Z",
        );

        assert!(payload.starts_with("madora-sync://pair?"));
        assert!(payload.contains("host=192.168.1.10"));
        assert!(payload.contains("port=3210"));
        assert!(payload.contains("pairingId=pairing-id"));
        assert!(payload.contains("pairingToken=pairing-token"));
        assert!(payload.contains("code=123456"));
        assert!(payload.contains("deviceName=Madora%20Desktop"));
    }

    #[test]
    fn authenticates_previously_paired_device_with_saved_token() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        let issued = store.issue_pairing_code().expect("pairing code");
        let config = store.get_config().expect("config");
        let pairing_id = config.active_pairing_id.clone().expect("active pairing id");
        let pairing_token = config
            .active_pairing_token
            .clone()
            .expect("active pairing token");

        let paired = store
            .pair_device(MadoraSyncPairDeviceInput {
                device_id: "phone-1".to_string(),
                device_name: "Phone".to_string(),
                platform: Some("ios".to_string()),
                pairing_id: Some(pairing_id.clone()),
                pairing_token: Some(pairing_token.clone()),
                pairing_code: Some(issued.code),
            })
            .expect("initial pairing");

        assert_eq!(
            paired.device.auth_token.as_deref(),
            Some(pairing_token.as_str())
        );
        assert_eq!(
            store
                .get_config()
                .expect("config after pairing")
                .active_pairing_id,
            None
        );

        let authenticated = store
            .authenticate_device(MadoraSyncPairDeviceInput {
                device_id: "phone-1".to_string(),
                device_name: "Phone Renamed".to_string(),
                platform: Some("ios".to_string()),
                pairing_id: Some(pairing_id),
                pairing_token: Some(pairing_token),
                pairing_code: None,
            })
            .expect("re-authentication");

        assert_eq!(authenticated.name, "Phone Renamed");
        assert_eq!(
            store
                .get_config()
                .expect("config after auth")
                .connection_state,
            MadoraSyncConnectionState::Connected
        );
    }

    #[test]
    fn pairs_device_with_manual_code_without_pairing_ticket() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        let issued = store.issue_pairing_code().expect("pairing code");
        let config = store.get_config().expect("config");
        let pairing_token = config
            .active_pairing_token
            .clone()
            .expect("active pairing token");

        let paired = store
            .pair_device(MadoraSyncPairDeviceInput {
                device_id: "phone-1".to_string(),
                device_name: "Phone".to_string(),
                platform: Some("ios".to_string()),
                pairing_id: None,
                pairing_token: None,
                pairing_code: Some(issued.code),
            })
            .expect("manual pairing");

        assert_eq!(
            paired.device.auth_token.as_deref(),
            Some(pairing_token.as_str())
        );
        assert_eq!(
            store
                .get_config()
                .expect("config after manual pairing")
                .active_pairing_id,
            None
        );
    }
}
