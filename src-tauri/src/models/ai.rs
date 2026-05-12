use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub enum AiProvider {
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "custom")]
    Custom,
    #[serde(rename = "deepseek")]
    DeepSeek,
    #[serde(rename = "kimi")]
    Kimi,
    #[serde(rename = "openai")]
    OpenAi,
}

impl Default for AiProvider {
    fn default() -> Self {
        Self::DeepSeek
    }
}

impl AiProvider {
    pub fn as_key(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::Custom => "custom",
            Self::DeepSeek => "deepseek",
            Self::Kimi => "kimi",
            Self::OpenAi => "openai",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Anthropic => "Anthropic",
            Self::Custom => "Custom",
            Self::DeepSeek => "DeepSeek",
            Self::Kimi => "Kimi",
            Self::OpenAi => "OpenAI",
        }
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompletionMode {
    Auto,
    ChatPrefix,
    Fim,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompletionResultMode {
    ChatPrefix,
    Fim,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub mode: Option<CompletionMode>,
    pub title: Option<String>,
    pub prefix: String,
    pub suffix: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub mode: CompletionResultMode,
    pub text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletionConfig {
    #[serde(default)]
    pub api_key: String,
    pub api_url: Option<String>,
    pub model: Option<String>,
    pub provider: Option<AiProvider>,
    pub smart_routing_enabled: bool,
}
