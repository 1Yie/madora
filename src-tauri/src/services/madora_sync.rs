use std::collections::HashMap;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration as StdDuration, Instant, SystemTime, UNIX_EPOCH};

use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::models::madora_sync::{
    MadoraSyncAiCompletionConfig, MadoraSyncConfig, MadoraSyncConnectionState,
    MadoraSyncPairDeviceInput, MadoraSyncPairedDevice, MadoraSyncPairingCode, MadoraSyncPairingQr,
    MadoraSyncSettingsInput,
};

const CONFIG_FILE_NAME: &str = "madora_sync_state.json";

/// Maximum number of failed pairing attempts from one source IP before it is
/// temporarily banned.
const MAX_FAILURES_PER_IP: u32 = 5;
/// How long a source IP stays banned after [`MAX_FAILURES_PER_IP`] failures.
const BAN_DURATION: StdDuration = StdDuration::from_secs(5 * 60);
/// Consecutive global pairing failures before the active pairing code is
/// invalidated so the desktop must issue a fresh one.
const MAX_GLOBAL_FAILURES: u32 = 10;
/// Unified error surfaced for any credential failure during authentication.
/// Kept identical for "unknown device" and "wrong token" so responses do not
/// leak whether a device is already paired.
const INVALID_CREDENTIALS_MESSAGE: &str = "Pairing credentials are invalid";

/// SHA-256 digest of `bytes` as lowercase hex.
pub fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;

    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

/// Length-safe constant-time string comparison. Mismatched lengths return
/// `false` without leaking the comparison result through timing.
fn constant_time_eq(a: &str, b: &str) -> bool {
    a.as_bytes().ct_eq(b.as_bytes()).into()
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

/// Result of a successful pairing or re-authentication.
pub struct PairingOutcome {
    /// Internal device record (never sent to the frontend as-is).
    pub device: MadoraSyncPairedDevice,
    /// Plaintext auth token to hand to the mobile client. The only moment the
    /// plaintext token leaves the desktop.
    pub auth_token: String,
    pub paired_at: String,
}

#[derive(Default)]
struct PeerFailure {
    failures: u32,
    last_failure: Option<Instant>,
    banned_until: Option<Instant>,
}

/// In-memory pairing attempt limiter. Uses explicit `Instant` parameters so
/// the policy can be unit-tested without sleeping.
#[derive(Default)]
struct PairingRateLimiter {
    peers: HashMap<IpAddr, PeerFailure>,
    global_failures: u32,
}

impl PairingRateLimiter {
    fn check(&self, ip: IpAddr, now: Instant) -> Result<(), String> {
        if let Some(entry) = self.peers.get(&ip) {
            if let Some(until) = entry.banned_until {
                if until > now {
                    let remaining = (until - now).as_secs() + 1;
                    return Err(format!(
                        "Too many failed pairing attempts. Try again in {remaining}s."
                    ));
                }
            }
        }

        Ok(())
    }

    /// Records a failure and returns `true` when the global failure cap was
    /// reached (the caller must then invalidate the active pairing code).
    fn record_failure(&mut self, ip: IpAddr, now: Instant) -> bool {
        self.sweep(now);

        let entry = self.peers.entry(ip).or_default();
        entry.failures += 1;
        entry.last_failure = Some(now);
        if entry.failures >= MAX_FAILURES_PER_IP {
            entry.banned_until = Some(now + BAN_DURATION);
        }

        self.global_failures += 1;
        if self.global_failures >= MAX_GLOBAL_FAILURES {
            self.global_failures = 0;
            return true;
        }

        false
    }

    fn record_success(&mut self, ip: IpAddr) {
        self.peers.remove(&ip);
        self.global_failures = 0;
    }

    fn sweep(&mut self, now: Instant) {
        self.peers.retain(|_, entry| match entry.banned_until {
            Some(until) => until > now,
            None => entry
                .last_failure
                .is_none_or(|last| now.saturating_duration_since(last) < BAN_DURATION),
        });
    }
}

pub struct MadoraSyncStore {
    config: Mutex<MadoraSyncConfig>,
    app_data_dir: PathBuf,
    pairing_limiter: Mutex<PairingRateLimiter>,
}

impl MadoraSyncStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let (config, migrated) = Self::load_config(&app_data_dir);
        if migrated {
            Self::save_config_inner(&app_data_dir, &config);
        }

        Self {
            config: Mutex::new(config),
            app_data_dir,
            pairing_limiter: Mutex::new(PairingRateLimiter::default()),
        }
    }

    fn config_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join(CONFIG_FILE_NAME)
    }

    /// Load the persisted config. Returns `(config, migrated)` where
    /// `migrated` is true when legacy plaintext tokens were converted to
    /// hashes and the file should be rewritten.
    fn load_config(app_data_dir: &PathBuf) -> (MadoraSyncConfig, bool) {
        let path = Self::config_path(app_data_dir);
        if !path.exists() {
            return (MadoraSyncConfig::default(), false);
        }

        let json = match std::fs::read_to_string(&path) {
            Ok(json) => json,
            Err(error) => {
                eprintln!("[madora-sync] failed to read config {path:?}: {error}");
                return (MadoraSyncConfig::default(), false);
            }
        };

        let mut config: MadoraSyncConfig = match serde_json::from_str(&json) {
            Ok(config) => config,
            Err(error) => {
                // Do not silently drop every paired device: keep a timestamped
                // backup of the unparseable file for manual recovery.
                let backup =
                    app_data_dir.join(format!("{CONFIG_FILE_NAME}.corrupt-{}", unix_timestamp()));
                eprintln!(
                    "[madora-sync] config file is corrupt ({error}); backing up to {backup:?}"
                );
                let _ = std::fs::rename(&path, &backup);
                return (MadoraSyncConfig::default(), false);
            }
        };

        // Migrate legacy plaintext device tokens to SHA-256 hashes.
        let mut migrated = false;
        for device in &mut config.paired_devices {
            let had_plaintext = device.auth_token.is_some();
            if device.token_hash.is_none() {
                if let Some(plaintext) = device.auth_token.take() {
                    device.token_hash = Some(sha256_hex(plaintext.as_bytes()));
                }
            } else {
                device.auth_token = None;
            }
            migrated |= had_plaintext;
        }

        (config, migrated)
    }

    /// Atomic write: write a sibling temp file, then rename over the target so
    /// a crash can never leave a half-written config behind.
    fn save_config_inner(app_data_dir: &PathBuf, config: &MadoraSyncConfig) {
        let path = Self::config_path(app_data_dir);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let Ok(json) = serde_json::to_string_pretty(config) else {
            return;
        };

        let temp_path = app_data_dir.join(format!("{CONFIG_FILE_NAME}.tmp-{}", std::process::id()));
        if std::fs::write(&temp_path, json).is_err() {
            return;
        }

        if std::fs::rename(&temp_path, &path).is_err() {
            let _ = std::fs::remove_file(&temp_path);
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

    fn issue_pairing_code_inner(
        config: &mut MadoraSyncConfig,
    ) -> Result<MadoraSyncPairingCode, String> {
        let code = generate_pairing_code()?;
        let expires_at = (Utc::now() + Duration::minutes(10)).to_rfc3339();
        let pairing_id = generate_pairing_secret(12)?;
        let pairing_token = generate_pairing_secret(24)?;

        config.active_pairing_id = Some(pairing_id);
        config.active_pairing_token = Some(pairing_token);
        config.active_pairing_code = Some(code.clone());
        config.pairing_code_expires_at = Some(expires_at.clone());

        Ok(MadoraSyncPairingCode { code, expires_at })
    }

    pub fn issue_pairing_code(&self) -> Result<MadoraSyncPairingCode, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;
        let issued = Self::issue_pairing_code_inner(&mut guard)?;
        let snapshot = guard.clone();
        Self::save_config_inner(&self.app_data_dir, &snapshot);
        Ok(issued)
    }

    /// Issue (if needed) and return the pairing QR payload. All state is read
    /// and written under a single lock to avoid the previous TOCTOU between
    /// `get_config` and `issue_pairing_code`.
    pub fn get_pairing_qr(&self) -> Result<MadoraSyncPairingQr, String> {
        let mut guard = self.config.lock().map_err(|e| e.to_string())?;

        let mut changed = Self::expire_pairing_code_if_needed(&mut guard);
        let has_ticket = guard.active_pairing_code.is_some()
            && guard.pairing_code_expires_at.is_some()
            && guard.active_pairing_id.is_some()
            && guard.active_pairing_token.is_some();
        if !has_ticket {
            Self::issue_pairing_code_inner(&mut guard)?;
            changed = true;
        }

        let (Some(code), Some(expires_at), Some(pairing_id), Some(pairing_token)) = (
            guard.active_pairing_code.clone(),
            guard.pairing_code_expires_at.clone(),
            guard.active_pairing_id.clone(),
            guard.active_pairing_token.clone(),
        ) else {
            return Err("No active pairing ticket".to_string());
        };

        let port = guard.port;
        let device_name = guard.device_name.clone();

        if changed {
            let snapshot = guard.clone();
            Self::save_config_inner(&self.app_data_dir, &snapshot);
        }
        drop(guard);

        let available_hosts = detect_lan_ipv4_candidates();
        let primary_host = available_hosts.first().cloned();
        let payload = primary_host.as_deref().map(|host| {
            build_pairing_payload(
                host,
                port,
                &pairing_id,
                &pairing_token,
                &code,
                &device_name,
                &expires_at,
            )
        });

        Ok(MadoraSyncPairingQr {
            pairing_id,
            payload,
            available_hosts,
            primary_host,
            port,
            code,
            expires_at,
            device_name,
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
    ) -> Result<PairingOutcome, String> {
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
            .ok_or_else(|| "No active pairing token".to_string())?
            .to_string();
        let expected_pairing_code = guard.active_pairing_code.as_deref();

        let token_matches = request
            .pairing_token
            .as_deref()
            .map(str::trim)
            .is_some_and(|token| constant_time_eq(token, &expected_pairing_token));
        let provided_pairing_code = request.pairing_code.as_deref().map(str::trim);
        let pairing_code_present = provided_pairing_code.is_some_and(|code| !code.is_empty());
        let fallback_code_matches = match (provided_pairing_code, expected_pairing_code) {
            (Some(code), Some(expected)) => constant_time_eq(code, expected),
            _ => false,
        };

        let pairing_id = request
            .pairing_id
            .as_deref()
            .map(str::trim)
            .filter(|pairing_id| !pairing_id.is_empty());
        match pairing_id {
            Some(pairing_id) if !constant_time_eq(pairing_id, expected_pairing_id) => {
                return Err(INVALID_CREDENTIALS_MESSAGE.to_string());
            }
            Some(_) => {}
            None if !pairing_code_present => {
                return Err("pairingId is required".to_string());
            }
            None => {}
        }

        if !token_matches && !fallback_code_matches {
            return Err(INVALID_CREDENTIALS_MESSAGE.to_string());
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
            token_hash: Some(sha256_hex(expected_pairing_token.as_bytes())),
            auth_token: None,
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

        Ok(PairingOutcome {
            device,
            auth_token: expected_pairing_token,
            paired_at,
        })
    }

    /// Authenticate a device from `source_ip`. Rate-limited: repeated failures
    /// ban the source IP and, past the global cap, invalidate the pairing code.
    pub fn authenticate_device(
        &self,
        request: MadoraSyncPairDeviceInput,
        source_ip: IpAddr,
    ) -> Result<PairingOutcome, String> {
        let now = Instant::now();
        {
            let limiter = self.pairing_limiter.lock().map_err(|e| e.to_string())?;
            limiter.check(source_ip, now)?;
        }

        if let Ok(device) = self.touch_paired_device(&request) {
            if let Ok(mut limiter) = self.pairing_limiter.lock() {
                limiter.record_success(source_ip);
            }

            let auth_token = request
                .pairing_token
                .as_deref()
                .map(str::trim)
                .unwrap_or_default()
                .to_string();
            let paired_at = device
                .last_seen_at
                .clone()
                .unwrap_or_else(|| Utc::now().to_rfc3339());

            return Ok(PairingOutcome {
                device,
                auth_token,
                paired_at,
            });
        }

        match self.pair_device(request) {
            Ok(outcome) => {
                if let Ok(mut limiter) = self.pairing_limiter.lock() {
                    limiter.record_success(source_ip);
                }
                Ok(outcome)
            }
            Err(_) => {
                let invalidate = self
                    .pairing_limiter
                    .lock()
                    .map(|mut limiter| limiter.record_failure(source_ip, now))
                    .unwrap_or(false);

                if invalidate {
                    if let Ok(mut guard) = self.config.lock() {
                        Self::clear_active_pairing(&mut guard);
                        let snapshot = guard.clone();
                        Self::save_config_inner(&self.app_data_dir, &snapshot);
                    }
                }

                Err(INVALID_CREDENTIALS_MESSAGE.to_string())
            }
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

        let Some(stored_hash) = device.token_hash.clone() else {
            return Err("Device needs to be paired again".to_string());
        };

        let token_matches = request
            .pairing_token
            .as_deref()
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .is_some_and(|token| constant_time_eq(&sha256_hex(token.as_bytes()), &stored_hash));
        if !token_matches {
            return Err(INVALID_CREDENTIALS_MESSAGE.to_string());
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
    use std::net::{Ipv4Addr, Ipv6Addr};

    fn local_peer() -> IpAddr {
        IpAddr::V4(Ipv4Addr::LOCALHOST)
    }

    fn pair_input(
        device_id: &str,
        pairing_id: Option<&str>,
        pairing_token: Option<&str>,
        pairing_code: Option<&str>,
    ) -> MadoraSyncPairDeviceInput {
        MadoraSyncPairDeviceInput {
            device_id: device_id.to_string(),
            device_name: "Phone".to_string(),
            platform: Some("ios".to_string()),
            pairing_id: pairing_id.map(str::to_string),
            pairing_token: pairing_token.map(str::to_string),
            pairing_code: pairing_code.map(str::to_string),
        }
    }

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
            .pair_device(pair_input(
                "phone-1",
                Some(&pairing_id),
                Some(&pairing_token),
                Some(&issued.code),
            ))
            .expect("initial pairing");

        assert_eq!(paired.auth_token, pairing_token);
        assert_eq!(
            paired.device.token_hash,
            Some(sha256_hex(pairing_token.as_bytes()))
        );
        assert_eq!(paired.device.auth_token, None);
        assert_eq!(
            store
                .get_config()
                .expect("config after pairing")
                .active_pairing_id,
            None
        );

        let authenticated = store
            .authenticate_device(
                pair_input("phone-1", Some(&pairing_id), Some(&pairing_token), None),
                local_peer(),
            )
            .expect("re-authentication");

        assert_eq!(authenticated.device.name, "Phone");
        assert_eq!(authenticated.auth_token, pairing_token);
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
            .pair_device(pair_input("phone-1", None, None, Some(&issued.code)))
            .expect("manual pairing");

        assert_eq!(paired.auth_token, pairing_token);
        assert_eq!(
            store
                .get_config()
                .expect("config after manual pairing")
                .active_pairing_id,
            None
        );
    }

    #[test]
    fn pairing_code_is_single_use() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        let issued = store.issue_pairing_code().expect("pairing code");

        store
            .pair_device(pair_input("phone-1", None, None, Some(&issued.code)))
            .expect("first use succeeds");

        let second = store.pair_device(pair_input("phone-2", None, None, Some(&issued.code)));
        assert!(second.is_err(), "the code must not work twice");
        assert_eq!(store.get_config().expect("config").paired_devices.len(), 1);
    }

    #[test]
    fn wrong_code_invalidates_after_global_cap() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        let issued = store.issue_pairing_code().expect("pairing code");

        // Fail from distinct IPs so per-IP bans never trip the path, but the
        // global counter does.
        for index in 0..MAX_GLOBAL_FAILURES {
            let ip = IpAddr::V4(Ipv4Addr::new(10, 0, 0, index as u8 + 1));
            let result =
                store.authenticate_device(pair_input("attacker", None, None, Some("000000")), ip);
            assert!(result.is_err());
        }

        assert_eq!(
            store.get_config().expect("config").active_pairing_code,
            None,
            "global cap must invalidate the pairing code"
        );

        // Original matching code no longer pairs because the ticket is gone.
        let result = store.pair_device(pair_input("phone-1", None, None, Some(&issued.code)));
        assert!(result.is_err());
    }

    #[test]
    fn bans_ip_after_repeated_failures() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        let _ = store.issue_pairing_code().expect("pairing code");
        let ip = IpAddr::V4(Ipv4Addr::new(192, 168, 1, 50));

        for _ in 0..MAX_FAILURES_PER_IP {
            let _ =
                store.authenticate_device(pair_input("attacker", None, None, Some("000000")), ip);
        }

        // Even correct credentials are rejected while the ban is active. Issue
        // a fresh code whose value we know, then hit the banned IP.
        let issued = store.issue_pairing_code().expect("pairing code");
        let banned =
            store.authenticate_device(pair_input("attacker", None, None, Some(&issued.code)), ip);
        assert!(banned.is_err());
    }

    #[test]
    fn rate_limiter_bans_and_recovers_with_fake_clock() {
        let mut limiter = PairingRateLimiter::default();
        let ip = IpAddr::V6(Ipv6Addr::LOCALHOST);
        let start = Instant::now();

        for offset in 0..MAX_FAILURES_PER_IP {
            limiter.record_failure(ip, start + StdDuration::from_secs(offset as u64));
        }
        assert!(limiter.check(ip, start).is_err());
        assert!(limiter
            .check(ip, start + BAN_DURATION - StdDuration::from_secs(1))
            .is_err());
        assert!(limiter
            .check(ip, start + BAN_DURATION + StdDuration::from_secs(1))
            .is_err());
        assert!(limiter.check(ip, start + BAN_DURATION * 2).is_ok());

        limiter.record_success(ip);
        assert_eq!(limiter.global_failures, 0);
    }

    #[test]
    fn rate_limiter_sweeps_expired_entries() {
        let mut limiter = PairingRateLimiter::default();
        let ip = IpAddr::V4(Ipv4Addr::new(10, 1, 2, 3));
        let start = Instant::now();

        limiter.record_failure(ip, start);
        assert_eq!(limiter.peers.len(), 1);
        limiter.sweep(start + BAN_DURATION + StdDuration::from_secs(1));
        assert!(limiter.peers.is_empty());
    }

    #[test]
    fn constant_time_comparison_matches_exact_only() {
        assert!(constant_time_eq("token-a", "token-a"));
        assert!(!constant_time_eq("token-a", "token-b"));
        assert!(!constant_time_eq("short", "longer-value"));
    }

    #[test]
    fn hashes_are_stable_hex() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn migrates_legacy_plaintext_token_on_load() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = temp_dir.path().join(CONFIG_FILE_NAME);
        let legacy = serde_json::json!({
            "pairedDevices": [{
                "id": "phone-1",
                "name": "Phone",
                "trusted": true,
                "authToken": "plain-token"
            }]
        });
        std::fs::write(&path, serde_json::to_string_pretty(&legacy).unwrap()).unwrap();

        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        let persisted = std::fs::read_to_string(&path).expect("config file");
        assert!(persisted.contains("tokenHash"), "hash must be persisted");
        assert!(
            !persisted.contains("plain-token"),
            "plaintext must not survive migration"
        );

        let authenticated = store
            .authenticate_device(
                pair_input("phone-1", None, Some("plain-token"), None),
                local_peer(),
            )
            .expect("legacy token still authenticates");
        assert_eq!(authenticated.device.id, "phone-1");
        assert_eq!(
            authenticated.device.token_hash,
            Some(sha256_hex(b"plain-token"))
        );
    }

    #[test]
    fn backs_up_corrupt_config_instead_of_dropping_devices() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let path = temp_dir.path().join(CONFIG_FILE_NAME);
        std::fs::write(&path, "{ this is not json").unwrap();

        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        assert!(store
            .get_config()
            .expect("config")
            .paired_devices
            .is_empty());

        let backups: Vec<_> = std::fs::read_dir(temp_dir.path())
            .expect("read dir")
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("madora_sync_state.json.corrupt-")
            })
            .collect();
        assert_eq!(backups.len(), 1, "corrupt file must be backed up");
        assert!(!path.exists(), "corrupt file must be moved aside");
    }

    #[test]
    fn config_is_written_atomically_without_temp_leftovers() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        store
            .save_settings(MadoraSyncSettingsInput {
                device_name: "Desk".to_string(),
                ..Default::default()
            })
            .expect("save settings");

        let path = temp_dir.path().join(CONFIG_FILE_NAME);
        let json = std::fs::read_to_string(&path).expect("config exists");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid json");
        assert_eq!(parsed["deviceName"], "Desk");

        let leftovers: Vec<_> = std::fs::read_dir(temp_dir.path())
            .expect("read dir")
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "temp file must be renamed away");
    }

    #[test]
    fn frontend_view_hides_all_tokens() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());
        let issued = store.issue_pairing_code().expect("pairing code");
        let config = store.get_config().expect("config");
        let pairing_id = config.active_pairing_id.clone().expect("pairing id");
        let pairing_token = config.active_pairing_token.clone().expect("pairing token");

        store
            .pair_device(pair_input(
                "phone-1",
                Some(&pairing_id),
                Some(&pairing_token),
                Some(&issued.code),
            ))
            .expect("pairing");

        let view = store.get_config().expect("config").to_view();
        let json = serde_json::to_string(&view).expect("serialize view");
        assert!(!json.contains("pairingToken"));
        assert!(!json.contains("authToken"));
        assert!(!json.contains("tokenHash"));
        assert!(!json.contains(&pairing_token));
    }

    #[test]
    fn pairing_qr_is_stable_across_repeated_calls() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let store = MadoraSyncStore::new(temp_dir.path().to_path_buf());

        let first = store.get_pairing_qr().expect("first qr");
        let second = store.get_pairing_qr().expect("second qr");
        assert_eq!(first.pairing_id, second.pairing_id);
        assert_eq!(first.code, second.code);
    }
}
