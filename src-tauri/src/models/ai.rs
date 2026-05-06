use serde::{Deserialize, Serialize};

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
    pub api_key: String,
    pub api_url: Option<String>,
    pub fim_enabled: bool,
    pub model: Option<String>,
}

#[derive(Deserialize)]
pub struct DeepSeekTextCompletionChoice {
    pub text: Option<String>,
}

#[derive(Deserialize)]
pub struct DeepSeekTextCompletionResponse {
    pub choices: Option<Vec<DeepSeekTextCompletionChoice>>,
}

#[derive(Deserialize)]
pub struct DeepSeekChatCompletionMessage {
    pub content: Option<String>,
}

#[derive(Deserialize)]
pub struct DeepSeekChatCompletionChoice {
    pub message: Option<DeepSeekChatCompletionMessage>,
}

#[derive(Deserialize)]
pub struct DeepSeekChatCompletionResponse {
    pub choices: Option<Vec<DeepSeekChatCompletionChoice>>,
}
