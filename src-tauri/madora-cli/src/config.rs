use std::sync::OnceLock;

use keyring_core::{Entry, Error};

use madora_lib::models::ai::{AiCompletionConfig, AiProvider, CustomProviderProtocol};

const AI_KEY_SERVICE: &str = "madora.ai";

static SECURE_STORE_INIT: OnceLock<Result<(), String>> = OnceLock::new();

fn ensure_secure_store() -> Result<(), String> {
    SECURE_STORE_INIT
        .get_or_init(|| {
            #[cfg(target_os = "linux")]
            let use_secret_service = true;
            #[cfg(not(target_os = "linux"))]
            let use_secret_service = false;

            keyring::use_native_store(use_secret_service)
                .map_err(|error| format!("无法访问系统密钥存储: {error}"))
        })
        .clone()
}


#[derive(Clone, Copy, Debug, clap::ValueEnum, PartialEq)]
pub enum Provider {
    #[clap(name = "openai")]
    OpenAi,
    #[clap(name = "deepseek")]
    DeepSeek,
    Anthropic,
    Custom,
}

impl Provider {
    pub fn to_ai_provider(self) -> AiProvider {
        match self {
            Provider::OpenAi => AiProvider::OpenAi,
            Provider::DeepSeek => AiProvider::DeepSeek,
            Provider::Anthropic => AiProvider::Anthropic,
            Provider::Custom => AiProvider::Custom,
        }
    }

    pub fn keyring_user(&self) -> &'static str {
        match self {
            Provider::OpenAi => "openai",
            Provider::DeepSeek => "deepseek",
            Provider::Anthropic => "anthropic",
            Provider::Custom => "custom",
        }
    }

    pub fn display_name(&self) -> &'static str {
        self.to_ai_provider().display_name()
    }

    /// Env var name for the API key override, e.g. MADORA_OPENAI_KEY
    pub fn env_var_name(&self) -> String {
        format!("MADORA_{}_KEY", self.display_name().to_uppercase())
    }
}

/// Resolve the API key: --api-key flag > MADORA_{PROVIDER}_KEY env > OS keyring.
pub fn resolve_api_key(provider: Provider, flag: Option<&str>) -> Result<String, String> {
    // 1. CLI flag
    if let Some(key) = flag {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    // 2. Environment variable
    let env_var = provider.env_var_name();
    if let Ok(key) = std::env::var(&env_var) {
        let trimmed = key.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    // 3. OS keyring
    load_keyring_key(provider)
}

fn load_keyring_key(provider: Provider) -> Result<String, String> {
    ensure_secure_store()?;

    let entry = Entry::new(AI_KEY_SERVICE, provider.keyring_user())
        .map_err(|e| format!("无法初始化系统密钥存储条目: {e}"))?;

    match entry.get_password() {
        Ok(key) => {
            let trimmed = key.trim().to_string();
            if trimmed.is_empty() {
                Err(format!(
                    "{} API Key 未设置。使用 --api-key 参数或设置 {} 环境变量",
                    provider.display_name(),
                    provider.env_var_name()
                ))
            } else {
                Ok(trimmed)
            }
        }
        Err(Error::NoEntry) => Err(format!(
            "{} API Key 未设置。使用 --api-key 参数或设置 {} 环境变量",
            provider.display_name(),
            provider.env_var_name()
        )),
        Err(e) => Err(format!(
            "读取 {} API Key 失败: {e}",
            provider.display_name()
        )),
    }
}

/// Build an AiCompletionConfig from CLI arguments, ready to pass to providers.
pub fn build_completion_config(
    provider: Provider,
    api_key: String,
    model: String,
    api_url: Option<String>,
    custom_protocol: Option<CustomCliProtocol>,
) -> AiCompletionConfig {
    let custom_protocol = custom_protocol.map(|p| match p {
        CustomCliProtocol::OpenAi => CustomProviderProtocol::OpenAi,
        CustomCliProtocol::Anthropic => CustomProviderProtocol::Anthropic,
    });

    AiCompletionConfig {
        api_key,
        api_url,
        custom_protocol,
        model: Some(model),
        provider: Some(provider.to_ai_provider()),
        use_ssl: true,
    }
}

/// CLI-side protocol selector for Custom provider.
#[derive(Clone, Copy, Debug, clap::ValueEnum)]
pub enum CustomCliProtocol {
    #[clap(name = "openai")]
    OpenAi,
    Anthropic,
}
