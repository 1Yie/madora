use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};

const LICENSE_FILE: &str = "license.json";
const TRIAL_DAYS: i64 = 14;
const DEFAULT_AUTH_SERVER_URL: &str = "http://localhost:3000";

fn auth_server_url() -> String {
	std::env::var("AUTH_SERVER_URL").unwrap_or_else(|_| DEFAULT_AUTH_SERVER_URL.to_string())
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
	pub machine_id: String,
	pub token: Option<String>,
	pub license_key: Option<String>,
	pub email: Option<String>,
	pub activated_at: Option<String>,
	pub trial_started_at: Option<String>,
	pub last_verified_at: Option<String>,
	#[serde(default)]
	pub activation_index: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
	pub state: LicenseState,
	pub trial_days_remaining: Option<i64>,
	pub trial_days_total: i64,
	pub activated: bool,
	pub license_key: Option<String>,
	pub email: Option<String>,
	pub activation_index: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LicenseState {
	#[serde(rename = "trial")]
	Trial,
	#[serde(rename = "active")]
	Active,
	#[serde(rename = "expired")]
	Expired,
}

#[derive(Deserialize)]
struct ActivateResponse {
	token: String,
	#[serde(default)]
	email: Option<String>,
	#[serde(default)]
	activation_index: Option<u32>,
}

#[derive(Deserialize)]
struct ApiError {
	error: Option<String>,
}


#[derive(Deserialize)]
struct VerifyResponse {
	valid: bool,
	#[serde(default)]
	email: Option<String>,
	#[serde(default)]
	#[allow(dead_code)]
	license_key: Option<String>,
	#[serde(default)]
	activation_index: Option<u32>,
}

fn translate_api_error(status: u16, body: &str) -> String {
	let code = serde_json::from_str::<ApiError>(body)
		.ok()
		.and_then(|e| e.error);

	match code.as_deref() {
		Some("LICENSE_NOT_FOUND") => "许可证不存在".into(),
		Some("LICENSE_EXPIRED") => "许可证已过期".into(),
		Some("LICENSE_ALREADY_ACTIVATED") => "许可证已在其他设备激活".into(),
		Some("LICENSE_MAX_ACTIVATIONS") | Some("MAX_ACTIVATIONS_REACHED") => {
			"许可证已达到最大激活次数".into()
		}
		Some("INVALID_MACHINE") | Some("MACHINE_MISMATCH") => "设备不匹配".into(),
		Some("INVALID_TOKEN") => "许可证令牌无效，请重新激活".into(),
		Some("NOT_ACTIVATED") => "此设备尚未激活".into(),
		Some("ACTIVATION_NOT_FOUND") => "未找到激活记录".into(),
		Some(code) => format!("服务器错误: {code}"),
		None => format!("服务器请求失败 (HTTP {status})"),
	}
}

pub struct LicenseService {
	app_data_dir: PathBuf,
	client: Client,
}

impl LicenseService {
	pub fn new(app_data_dir: PathBuf) -> Self {
		Self {
			app_data_dir,
			client: Client::new(),
		}
	}

	fn license_path(&self) -> PathBuf {
		self.app_data_dir.join(LICENSE_FILE)
	}

	fn generate_machine_id() -> String {
		let mut buf = [0u8; 16];
		getrandom::getrandom(&mut buf).ok();
		format!(
			"{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
			buf[0], buf[1], buf[2], buf[3],
			buf[4], buf[5],
			buf[6], buf[7],
			buf[8], buf[9],
			buf[10], buf[11], buf[12], buf[13], buf[14], buf[15],
		)
	}

	pub fn load_license_info(&self) -> Result<LicenseInfo, String> {
		let path = self.license_path();

		if !path.exists() {
			let info = LicenseInfo {
				machine_id: Self::generate_machine_id(),
				token: None,
				license_key: None,
				email: None,
				activated_at: None,
				trial_started_at: Some(Utc::now().to_rfc3339()),
				last_verified_at: None,
				activation_index: None,
			};
			self.save_license_info(&info)?;
			return Ok(info);
		}

		let content = fs::read_to_string(&path)
			.map_err(|e| format!("读取许可证文件失败: {e}"))?;

		serde_json::from_str(&content)
			.map_err(|e| format!("解析许可证文件失败: {e}"))
	}

	fn save_license_info(&self, info: &LicenseInfo) -> Result<(), String> {
		let path = self.license_path();

		if let Some(parent) = path.parent() {
			fs::create_dir_all(parent)
				.map_err(|e| format!("创建许可证目录失败: {e}"))?;
		}

		let content = serde_json::to_string_pretty(info)
			.map_err(|e| format!("序列化许可证信息失败: {e}"))?;

		fs::write(&path, content)
			.map_err(|e| format!("写入许可证文件失败: {e}"))
	}

	pub fn get_status(&self) -> Result<LicenseStatus, String> {
		let info = self.load_license_info()?;

		if let Some(token) = &info.token {
			if !token.is_empty() {
				return Ok(LicenseStatus {
					state: LicenseState::Active,
					trial_days_remaining: None,
					trial_days_total: TRIAL_DAYS,
					activated: true,
					license_key: info.license_key.clone(),
					email: info.email.clone(),
					activation_index: info.activation_index,
				});
			}
		}

		let trial_started = info
			.trial_started_at
			.as_ref()
			.and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
			.map(|dt| dt.with_timezone(&Utc));

		if let Some(started) = trial_started {
			let now = Utc::now();
			let elapsed = (now - started).num_days();
			let remaining = TRIAL_DAYS - elapsed;

			if remaining > 0 {
				Ok(LicenseStatus {
					state: LicenseState::Trial,
					trial_days_remaining: Some(remaining),
					trial_days_total: TRIAL_DAYS,
					activated: false,
					license_key: None,
					email: None,
					activation_index: None,
				})
			} else {
				Ok(LicenseStatus {
					state: LicenseState::Expired,
					trial_days_remaining: Some(0),
					trial_days_total: TRIAL_DAYS,
					activated: false,
					license_key: None,
					email: None,
					activation_index: None,
				})
			}
		} else {
			let now = Utc::now().to_rfc3339();
			let mut updated = info;
			updated.trial_started_at = Some(now);
			self.save_license_info(&updated)?;

			Ok(LicenseStatus {
				state: LicenseState::Trial,
				trial_days_remaining: Some(TRIAL_DAYS),
				trial_days_total: TRIAL_DAYS,
				activated: false,
				license_key: None,
				email: None,
				activation_index: None,
			})
		}
	}

	fn validate_key_format(key: &str) -> Result<(), String> {
		let key = key.trim().to_uppercase();
		let parts: Vec<&str> = key.split('-').collect();

		if parts.len() != 5 || parts[0] != "MADO" {
			return Err("许可证密钥格式无效：必须以 MADO 开头".into());
		}

		for part in &parts {
			if part.len() != 4 {
				return Err("许可证密钥格式无效：每个段必须是 4 个字符".into());
			}
			if !part.chars().all(|c| c.is_ascii_alphanumeric()) {
				return Err("许可证密钥格式无效：只能包含 0-9 和 A-Z".into());
			}
		}

		Ok(())
	}

	pub async fn activate(&self, key: &str) -> Result<LicenseStatus, String> {
		Self::validate_key_format(key)?;

		let info = self.load_license_info()?;

		let response = self
			.client
			.post(format!("{}/licenses/activate", auth_server_url()))
			.json(&serde_json::json!({
				"key": key.to_uppercase(),
				"machineId": info.machine_id,
				"machineLabel": hostname(),
			}))
			.send()
			.await
			.map_err(|e| format!("连接验证服务器失败: {e}"))?;
		if !response.status().is_success() {
			let status = response.status();
			let body = response.text().await.unwrap_or_default();
			let msg = translate_api_error(status.as_u16(), &body);
			return Err(msg);
		}

		let activate_response: ActivateResponse = response
			.json()
			.await
			.map_err(|e| format!("解析服务器响应失败: {e}"))?;

		let activated_at = Utc::now().to_rfc3339();
		let updated = LicenseInfo {
			token: Some(activate_response.token),
			license_key: Some(key.to_uppercase()),
			email: activate_response.email.or(info.email),
			activated_at: Some(activated_at.clone()),
			last_verified_at: Some(activated_at.clone()),
			activation_index: activate_response.activation_index,
			..info
		};

		self.save_license_info(&updated)?;

		Ok(LicenseStatus {
			state: LicenseState::Active,
			trial_days_remaining: None,
			trial_days_total: TRIAL_DAYS,
			activated: true,
			license_key: updated.license_key,
			email: updated.email,
			activation_index: updated.activation_index,
		})
	}

	pub async fn verify(&self) -> Result<LicenseStatus, String> {
		let info = self.load_license_info()?;

		let token = match &info.token {
			Some(t) if !t.is_empty() => t.clone(),
			_ => return self.get_status(),
		};

		let response = self
			.client
			.post(format!("{}/licenses/verify", auth_server_url()))
			.json(&serde_json::json!({
				"token": token,
				"machineId": info.machine_id,
			}))
			.send()
			.await
			.map_err(|e| format!("连接验证服务器失败: {e}"))?;

		if !response.status().is_success() {
			return self.get_status();
		}

		let verify_response: VerifyResponse = response
			.json()
			.await
			.map_err(|e| format!("解析服务器响应失败: {e}"))?;

		if verify_response.valid {
			let verified_at = Utc::now().to_rfc3339();
			let mut updated = info;
			updated.last_verified_at = Some(verified_at);
			if verify_response.email.is_some() {
				updated.email = verify_response.email;
			}
			if verify_response.activation_index.is_some() {
				updated.activation_index = verify_response.activation_index;
			}
			self.save_license_info(&updated)?;

			Ok(LicenseStatus {
				state: LicenseState::Active,
				trial_days_remaining: None,
				trial_days_total: TRIAL_DAYS,
				activated: true,
				license_key: updated.license_key,
				email: updated.email,
				activation_index: updated.activation_index,
			})
		} else {
			let mut reset = info;
			reset.token = None;
			reset.license_key = None;
			reset.email = None;
			reset.activated_at = None;
			reset.last_verified_at = None;
			reset.activation_index = None;
			self.save_license_info(&reset)?;

			self.get_status()
		}
	}

	pub async fn deactivate(&self) -> Result<(), String> {
		let info = self.load_license_info()?;

		let license_key = match &info.license_key {
			Some(k) => k.clone(),
			None => return Err("没有可停用的许可证".into()),
		};

		let _ = self
			.client
			.post(format!("{}/licenses/deactivate", auth_server_url()))
			.json(&serde_json::json!({
				"key": license_key,
				"machineId": info.machine_id,
			}))
			.send()
			.await;

		let reset = LicenseInfo {
			token: None,
			license_key: None,
			email: None,
			activated_at: None,
			last_verified_at: None,
			activation_index: None,
			..info
		};

		self.save_license_info(&reset)?;
		Ok(())
	}
}

fn hostname() -> String {
	std::process::Command::new("hostname")
		.output()
		.ok()
		.and_then(|o| String::from_utf8(o.stdout).ok())
		.map(|s| s.trim().to_string())
		.unwrap_or_else(|| "unknown".into())
}
