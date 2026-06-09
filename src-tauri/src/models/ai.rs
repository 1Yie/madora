use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[derive(Default)]
pub enum CustomProviderProtocol {
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "openai")]
    #[default]
    OpenAi,
}


#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[derive(Default)]
pub enum AiProvider {
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "custom")]
    Custom,
    #[serde(rename = "deepseek")]
    #[default]
    DeepSeek,
    #[serde(rename = "kimi")]
    Kimi,
    #[serde(rename = "mimo")]
    MiMo,
    #[serde(rename = "mimo-coding")]
    MiMoCoding,
    #[serde(rename = "minimax")]
    MiniMax,
    #[serde(rename = "openai")]
    OpenAi,
}


impl AiProvider {
    pub fn as_key(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::Custom => "custom",
            Self::DeepSeek => "deepseek",
            Self::Kimi => "kimi",
            Self::MiMo => "mimo",
            Self::MiMoCoding => "mimo-coding",
            Self::MiniMax => "minimax",
            Self::OpenAi => "openai",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Anthropic => "Anthropic",
            Self::Custom => "Custom",
            Self::DeepSeek => "DeepSeek",
            Self::Kimi => "Kimi",
            Self::MiMo => "Xiaomi MiMo",
            Self::MiMoCoding => "Xiaomi MiMo Coding Plan",
            Self::MiniMax => "MiniMax",
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
    /// Whether to use HTTPS. Default true. Auto-prepended when URL has no scheme.
    #[serde(default = "true_fn")]
    pub use_ssl: bool,
}

fn true_fn() -> bool {
    true
}
