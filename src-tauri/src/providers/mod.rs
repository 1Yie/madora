mod anthropic;
mod common;
mod custom;
mod deepseek;
mod kimi;
mod mimo;
mod mimo_coding;
mod minimax;
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
const MINIMAX_DEFAULT_API_URL: &str = "https://api.minimax.io";
const MINIMAX_DEFAULT_MODEL: &str = "MiniMax-M2.7";
const MIMO_DEFAULT_API_URL: &str = "https://api.xiaomimimo.com";
const MIMO_DEFAULT_MODEL: &str = "mimo-v2.5-pro";
const MIMO_CODING_DEFAULT_API_URL: &str = "https://token-plan-cn.xiaomimimo.com";
const MIMO_CODING_DEFAULT_MODEL: &str = "mimo-v2.5-pro";
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
static KIMI_PROVIDER: kimi::KimiProvider = kimi::KimiProvider;
static MINIMAX_PROVIDER: minimax::MiniMaxProvider = minimax::MiniMaxProvider;
static MIMO_PROVIDER: mimo::MiMoProvider = mimo::MiMoProvider;
static MIMO_CODING_PROVIDER: mimo_coding::MiMoCodingProvider = mimo_coding::MiMoCodingProvider;
static OPENAI_PROVIDER: openai::OpenAiProvider = openai::OpenAiProvider;

pub fn get_provider(provider: AiProvider) -> &'static dyn CompletionProvider {
    match provider {
        AiProvider::Anthropic => &ANTHROPIC_PROVIDER,
        AiProvider::Custom => &CUSTOM_PROVIDER,
        AiProvider::DeepSeek => &DEEPSEEK_PROVIDER,
        AiProvider::Kimi => &KIMI_PROVIDER,
        AiProvider::MiniMax => &MINIMAX_PROVIDER,
        AiProvider::MiMo => &MIMO_PROVIDER,
        AiProvider::MiMoCoding => &MIMO_CODING_PROVIDER,
        AiProvider::OpenAi => &OPENAI_PROVIDER,
    }
}

pub fn default_api_url(provider: AiProvider) -> Option<&'static str> {
    match provider {
        AiProvider::Anthropic => Some(ANTHROPIC_DEFAULT_API_URL),
        AiProvider::Custom => None,
        AiProvider::DeepSeek => Some(DEEPSEEK_DEFAULT_API_URL),
        AiProvider::Kimi => Some(KIMI_DEFAULT_API_URL),
        AiProvider::MiniMax => Some(MINIMAX_DEFAULT_API_URL),
        AiProvider::MiMo => Some(MIMO_DEFAULT_API_URL),
        AiProvider::MiMoCoding => Some(MIMO_CODING_DEFAULT_API_URL),
        AiProvider::OpenAi => Some(OPENAI_DEFAULT_API_URL),
    }
}

pub fn default_model(provider: AiProvider) -> Option<&'static str> {
    match provider {
        AiProvider::Anthropic => Some(ANTHROPIC_DEFAULT_MODEL),
        AiProvider::Custom => None,
        AiProvider::DeepSeek => Some(DEEPSEEK_DEFAULT_MODEL),
        AiProvider::Kimi => Some(KIMI_DEFAULT_MODEL),
        AiProvider::MiniMax => Some(MINIMAX_DEFAULT_MODEL),
        AiProvider::MiMo => Some(MIMO_DEFAULT_MODEL),
        AiProvider::MiMoCoding => Some(MIMO_CODING_DEFAULT_MODEL),
        AiProvider::OpenAi => Some(OPENAI_DEFAULT_MODEL),
    }
}
