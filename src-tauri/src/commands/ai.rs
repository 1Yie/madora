use std::{collections::HashMap, sync::{LazyLock, Mutex}};

use tauri::{ipc::Channel, State};

use crate::{
	models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CompletionResult},
	services::ai,
	services::license::LicenseService,
};

use super::secure_storage;

static API_KEY_CACHE: LazyLock<Mutex<HashMap<AiProvider, String>>> =
    LazyLock::new(Default::default);

fn require_api_key(provider: AiProvider) -> Result<String, String> {
    {
        let cache = API_KEY_CACHE.lock().unwrap();
        if let Some(key) = cache.get(&provider) {
            if !key.is_empty() {
                return Ok(key.clone());
            }
        }
    }

    let api_key = secure_storage::load_ai_api_key_sync(provider)?
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .ok_or_else(|| format!("请先在设置中保存 {} API Key", provider.display_name()))?;

    {
        let mut cache = API_KEY_CACHE.lock().unwrap();
        cache.insert(provider, api_key.clone());
    }

    Ok(api_key)
}

pub(crate) fn invalidate_api_key_cache() {
    API_KEY_CACHE.lock().unwrap().clear();
}
#[tauri::command]
pub async fn generate_completion(
	service: State<'_, ai::AiCompletionService>,
	license_service: State<'_, LicenseService>,
	mut config: AiCompletionConfig,
	request: CompletionRequest,
) -> Result<CompletionResult, String> {
	license_service.ensure_valid().await?;
	let provider = config.provider.unwrap_or_default();
	config.api_key = require_api_key(provider)?;

	ai::generate_completion(service.inner(), &config, &request).await
}


#[tauri::command]
pub async fn generate_completion_stream(
	service: State<'_, ai::AiCompletionService>,
	license_service: State<'_, LicenseService>,
	mut config: AiCompletionConfig,
	request: CompletionRequest,
	channel: Channel<String>,
) -> Result<(), String> {
	license_service.ensure_valid().await?;
	let provider = config.provider.unwrap_or_default();
	config.api_key = require_api_key(provider)?;

	ai::generate_completion_stream(service.inner(), &config, &request, channel).await
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalidate_api_key_cache_clears_cache() {
        {
            let mut cache = API_KEY_CACHE.lock().unwrap();
            cache.insert(AiProvider::DeepSeek, "sk-test".into());
        }
        assert!(!API_KEY_CACHE.lock().unwrap().is_empty());

        invalidate_api_key_cache();

        assert!(API_KEY_CACHE.lock().unwrap().is_empty());
    }

    #[test]
    fn invalidate_api_key_cache_empty_is_ok() {
        invalidate_api_key_cache();
        assert!(API_KEY_CACHE.lock().unwrap().is_empty());
    }

    #[test]
    fn require_api_key_cache_hit_returns_key() {
        invalidate_api_key_cache();

        {
            let mut cache = API_KEY_CACHE.lock().unwrap();
            cache.insert(AiProvider::DeepSeek, "sk-cached-key".into());
        }

        let result = require_api_key(AiProvider::DeepSeek);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "sk-cached-key");
    }

    #[test]
    fn require_api_key_cache_miss_no_keyring_fallback() {
        invalidate_api_key_cache();

        let result = require_api_key(AiProvider::DeepSeek);
        match result {
            Ok(key) => {
                assert!(!key.is_empty());
            }
            Err(msg) => {
                assert!(msg.contains("API Key") || msg.contains("密钥存储"));
            }
        }
    }
}
