mod anthropic;
mod common;
mod custom;
mod deepseek;
mod google;
mod kimi;
mod mimo;
mod mimo_coding;
mod minimax;
mod minimax_coding;
mod openai;
mod opencode_go;
mod opencode_zen;
mod zhipu;
mod zhipu_coding;

#[cfg(test)]
pub(crate) mod test_support;

use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
};

pub use common::{
    build_prompt_context, resolve_api_url, resolve_model, MAX_CHAT_PREFIX_CHARS,
    MAX_CHAT_SUFFIX_CHARS,
};

const ANTHROPIC_DEFAULT_API_URL: &str = "https://api.anthropic.com";
const ANTHROPIC_DEFAULT_MODEL: &str = "claude-sonnet-4-6";
const DEEPSEEK_DEFAULT_API_URL: &str = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-v4-pro";
const GOOGLE_DEFAULT_API_URL: &str = "https://generativelanguage.googleapis.com";
const GOOGLE_DEFAULT_MODEL: &str = "gemini-2.5-flash";
const KIMI_DEFAULT_API_URL: &str = "https://api.moonshot.cn";
const KIMI_DEFAULT_MODEL: &str = "kimi-k2.7-code";
const MINIMAX_DEFAULT_API_URL: &str = "https://api.minimaxi.com/anthropic";
const MINIMAX_DEFAULT_MODEL: &str = "MiniMax-M3";
const MINIMAX_CODING_DEFAULT_API_URL: &str = "https://api.minimaxi.com/anthropic";
const MINIMAX_CODING_DEFAULT_MODEL: &str = "MiniMax-M3";
const MIMO_DEFAULT_API_URL: &str = "https://api.xiaomimimo.com";
const MIMO_DEFAULT_MODEL: &str = "mimo-v2.5-pro";
const MIMO_CODING_DEFAULT_API_URL: &str = "https://token-plan-cn.xiaomimimo.com";
const MIMO_CODING_DEFAULT_MODEL: &str = "mimo-v2.5-pro";
const OPENAI_DEFAULT_API_URL: &str = "https://api.openai.com";
const OPENAI_DEFAULT_MODEL: &str = "gpt-4o-mini";
const OPENCODE_GO_DEFAULT_API_URL: &str = "https://opencode.ai/zen/go";
const OPENCODE_GO_DEFAULT_MODEL: &str = "deepseek-v4-pro";
const OPENCODE_ZEN_DEFAULT_API_URL: &str = "https://opencode.ai/zen";
const OPENCODE_ZEN_DEFAULT_MODEL: &str = "claude-sonnet-4-6";
const ZHIPU_DEFAULT_API_URL: &str = "https://open.bigmodel.cn/api/paas/v4";
const ZHIPU_DEFAULT_MODEL: &str = "glm-5.2";
const ZHIPU_CODING_DEFAULT_API_URL: &str = "https://open.bigmodel.cn/api/coding/paas/v4";
const ZHIPU_CODING_DEFAULT_MODEL: &str = "glm-5.2";

#[async_trait]
pub trait CompletionProvider: Send + Sync {
    #[allow(dead_code)]
    fn provider(&self) -> AiProvider;

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String>;

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        let text = self
            .request_fim_completion(client, prompt_manager, config, request)
            .await?;

        if !text.is_empty() {
            on_chunk(text.clone())?;
        }

        Ok(text)
    }
}

static ANTHROPIC_PROVIDER: anthropic::AnthropicProvider = anthropic::AnthropicProvider;
static CUSTOM_PROVIDER: custom::CustomProvider = custom::CustomProvider;
static DEEPSEEK_PROVIDER: deepseek::DeepSeekProvider = deepseek::DeepSeekProvider;
static GOOGLE_PROVIDER: google::GoogleProvider = google::GoogleProvider;
static KIMI_PROVIDER: kimi::KimiProvider = kimi::KimiProvider;
static MINIMAX_PROVIDER: minimax::MiniMaxProvider = minimax::MiniMaxProvider;
static MINIMAX_CODING_PROVIDER: minimax_coding::MiniMaxCodingProvider =
    minimax_coding::MiniMaxCodingProvider;
static MIMO_PROVIDER: mimo::MiMoProvider = mimo::MiMoProvider;
static MIMO_CODING_PROVIDER: mimo_coding::MiMoCodingProvider = mimo_coding::MiMoCodingProvider;
static OPENCODE_GO_PROVIDER: opencode_go::OpenCodeGoProvider = opencode_go::OpenCodeGoProvider;
static OPENCODE_ZEN_PROVIDER: opencode_zen::OpenCodeZenProvider = opencode_zen::OpenCodeZenProvider;
static OPENAI_PROVIDER: openai::OpenAiProvider = openai::OpenAiProvider;
static ZHIPU_PROVIDER: zhipu::ZhipuProvider = zhipu::ZhipuProvider;
static ZHIPU_CODING_PROVIDER: zhipu_coding::ZhipuCodingProvider = zhipu_coding::ZhipuCodingProvider;

pub fn get_provider(provider: AiProvider) -> &'static dyn CompletionProvider {
    match provider {
        AiProvider::Anthropic => &ANTHROPIC_PROVIDER,
        AiProvider::Custom => &CUSTOM_PROVIDER,
        AiProvider::DeepSeek => &DEEPSEEK_PROVIDER,
        AiProvider::Google => &GOOGLE_PROVIDER,
        AiProvider::Kimi => &KIMI_PROVIDER,
        AiProvider::MiniMax => &MINIMAX_PROVIDER,
        AiProvider::MiniMaxCoding => &MINIMAX_CODING_PROVIDER,
        AiProvider::MiMo => &MIMO_PROVIDER,
        AiProvider::MiMoCoding => &MIMO_CODING_PROVIDER,
        AiProvider::OpenAi => &OPENAI_PROVIDER,
        AiProvider::OpenCodeGo => &OPENCODE_GO_PROVIDER,
        AiProvider::OpenCodeZen => &OPENCODE_ZEN_PROVIDER,
        AiProvider::Zhipu => &ZHIPU_PROVIDER,
        AiProvider::ZhipuCoding => &ZHIPU_CODING_PROVIDER,
    }
}

pub fn default_api_url(provider: AiProvider) -> Option<&'static str> {
    match provider {
        AiProvider::Anthropic => Some(ANTHROPIC_DEFAULT_API_URL),
        AiProvider::Custom => None,
        AiProvider::DeepSeek => Some(DEEPSEEK_DEFAULT_API_URL),
        AiProvider::Google => Some(GOOGLE_DEFAULT_API_URL),
        AiProvider::Kimi => Some(KIMI_DEFAULT_API_URL),
        AiProvider::MiniMax => Some(MINIMAX_DEFAULT_API_URL),
        AiProvider::MiniMaxCoding => Some(MINIMAX_CODING_DEFAULT_API_URL),
        AiProvider::MiMo => Some(MIMO_DEFAULT_API_URL),
        AiProvider::MiMoCoding => Some(MIMO_CODING_DEFAULT_API_URL),
        AiProvider::OpenAi => Some(OPENAI_DEFAULT_API_URL),
        AiProvider::OpenCodeGo => Some(OPENCODE_GO_DEFAULT_API_URL),
        AiProvider::OpenCodeZen => Some(OPENCODE_ZEN_DEFAULT_API_URL),
        AiProvider::Zhipu => Some(ZHIPU_DEFAULT_API_URL),
        AiProvider::ZhipuCoding => Some(ZHIPU_CODING_DEFAULT_API_URL),
    }
}

pub fn default_model(provider: AiProvider) -> Option<&'static str> {
    match provider {
        AiProvider::Anthropic => Some(ANTHROPIC_DEFAULT_MODEL),
        AiProvider::Custom => None,
        AiProvider::DeepSeek => Some(DEEPSEEK_DEFAULT_MODEL),
        AiProvider::Google => Some(GOOGLE_DEFAULT_MODEL),
        AiProvider::Kimi => Some(KIMI_DEFAULT_MODEL),
        AiProvider::MiniMax => Some(MINIMAX_DEFAULT_MODEL),
        AiProvider::MiniMaxCoding => Some(MINIMAX_CODING_DEFAULT_MODEL),
        AiProvider::MiMo => Some(MIMO_DEFAULT_MODEL),
        AiProvider::MiMoCoding => Some(MIMO_CODING_DEFAULT_MODEL),
        AiProvider::OpenAi => Some(OPENAI_DEFAULT_MODEL),
        AiProvider::OpenCodeGo => Some(OPENCODE_GO_DEFAULT_MODEL),
        AiProvider::OpenCodeZen => Some(OPENCODE_ZEN_DEFAULT_MODEL),
        AiProvider::Zhipu => Some(ZHIPU_DEFAULT_MODEL),
        AiProvider::ZhipuCoding => Some(ZHIPU_CODING_DEFAULT_MODEL),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{default_model, AiProvider};

    /// Every provider's built-in default model must exist in the shipped model
    /// catalogue, otherwise the UI and the backend disagree about what will be
    /// requested when the user has not picked a model.
    #[test]
    fn default_models_exist_in_the_catalogue() {
        let catalogue: HashMap<String, Vec<serde_json::Value>> =
            serde_json::from_str(include_str!("../../../src/assets/models.json"))
                .expect("models.json should be valid JSON");

        let providers = [
            AiProvider::Anthropic,
            AiProvider::DeepSeek,
            AiProvider::Google,
            AiProvider::Kimi,
            AiProvider::MiniMax,
            AiProvider::MiniMaxCoding,
            AiProvider::MiMo,
            AiProvider::MiMoCoding,
            AiProvider::OpenAi,
            AiProvider::OpenCodeGo,
            AiProvider::OpenCodeZen,
            AiProvider::Zhipu,
            AiProvider::ZhipuCoding,
        ];

        for provider in providers {
            let model = default_model(provider)
                .unwrap_or_else(|| panic!("provider {provider:?} should declare a default model"));
            let values = catalogue
                .get(provider.as_key())
                .unwrap_or_else(|| panic!("models.json is missing key {}", provider.as_key()));
            let present = values
                .iter()
                .any(|entry| entry.get("value").and_then(|v| v.as_str()) == Some(model));

            assert!(
                present,
                "default model '{model}' for {:?} is not in src/assets/models.json",
                provider
            );
        }

        assert!(default_model(AiProvider::Custom).is_none());
    }
}
