mod anthropic;
mod common;
mod custom;
mod deepseek;
mod kimi;
mod openai;

use async_trait::async_trait;
use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
};

pub use common::{resolve_api_url, resolve_model};

const ANTHROPIC_DEFAULT_API_URL: &str = "https://api.anthropic.com";
const ANTHROPIC_DEFAULT_MODEL: &str = "claude-3-5-sonnet-latest";
const DEEPSEEK_DEFAULT_API_URL: &str = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-v4-pro";
const KIMI_DEFAULT_API_URL: &str = "https://api.moonshot.cn";
const KIMI_DEFAULT_MODEL: &str = "moonshot-v1-8k";
const OPENAI_DEFAULT_API_URL: &str = "https://api.openai.com";
const OPENAI_DEFAULT_MODEL: &str = "gpt-4o-mini";

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
}

static ANTHROPIC_PROVIDER: anthropic::AnthropicProvider = anthropic::AnthropicProvider;
static CUSTOM_PROVIDER: custom::CustomProvider = custom::CustomProvider;
static DEEPSEEK_PROVIDER: deepseek::DeepSeekProvider = deepseek::DeepSeekProvider;
static KIMI_PROVIDER: kimi::KimiProvider = kimi::KimiProvider;
static OPENAI_PROVIDER: openai::OpenAiProvider = openai::OpenAiProvider;

pub fn get_provider(provider: AiProvider) -> &'static dyn CompletionProvider {
    match provider {
        AiProvider::Anthropic => &ANTHROPIC_PROVIDER,
        AiProvider::Custom => &CUSTOM_PROVIDER,
        AiProvider::DeepSeek => &DEEPSEEK_PROVIDER,
        AiProvider::Kimi => &KIMI_PROVIDER,
        AiProvider::OpenAi => &OPENAI_PROVIDER,
    }
}

pub fn default_api_url(provider: AiProvider) -> Option<&'static str> {
    match provider {
        AiProvider::Anthropic => Some(ANTHROPIC_DEFAULT_API_URL),
        AiProvider::Custom => None,
        AiProvider::DeepSeek => Some(DEEPSEEK_DEFAULT_API_URL),
        AiProvider::Kimi => Some(KIMI_DEFAULT_API_URL),
        AiProvider::OpenAi => Some(OPENAI_DEFAULT_API_URL),
    }
}

pub fn default_model(provider: AiProvider) -> Option<&'static str> {
    match provider {
        AiProvider::Anthropic => Some(ANTHROPIC_DEFAULT_MODEL),
        AiProvider::Custom => None,
        AiProvider::DeepSeek => Some(DEEPSEEK_DEFAULT_MODEL),
        AiProvider::Kimi => Some(KIMI_DEFAULT_MODEL),
        AiProvider::OpenAi => Some(OPENAI_DEFAULT_MODEL),
    }
}
