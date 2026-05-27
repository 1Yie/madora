use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub enum CustomProviderProtocol {
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "openai")]
    OpenAi,
}

impl Default for CustomProviderProtocol {
    fn default() -> Self {
        Self::OpenAi
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub title: Option<String>,
    pub prefix: String,
    pub suffix: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub text: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompletionConfig {
    #[serde(default)]
    pub api_key: String,
    pub api_url: Option<String>,
    pub custom_protocol: Option<CustomProviderProtocol>,
    pub model: Option<String>,
    pub provider: Option<AiProvider>,
}
