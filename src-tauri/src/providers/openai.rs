use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_openai_compatible, PromptManager},
    providers::{
        common::{
            build_prompt_context, join_url, resolve_api_key, stream_sse_response,
            take_chat_completion, ChatCompletionMessage, ChatCompletionResponse,
            MAX_COMPLETION_TOKENS, STOP_SEQUENCES,
        },
        default_api_url, default_model, resolve_api_url, resolve_model, CompletionProvider,
    },
};

#[derive(Deserialize)]
struct ChatCompletionDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct StreamingChatCompletionChoice {
    delta: Option<ChatCompletionDelta>,
    message: Option<ChatCompletionMessage>,
    text: Option<String>,
}

#[derive(Deserialize)]
struct StreamingChatCompletionResponse {
    choices: Option<Vec<StreamingChatCompletionChoice>>,
}

pub struct OpenAiProvider;

#[async_trait]
impl CompletionProvider for OpenAiProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::OpenAi
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        request_openai_compatible_fim(client, prompt_manager, config, request).await
    }

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        request_openai_compatible_fim_stream(client, prompt_manager, config, request, on_chunk)
            .await
    }
}

pub(crate) async fn request_openai_compatible_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::OpenAi);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_openai_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt = prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context);
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context);

    let has_suffix = request
        .suffix
        .as_deref()
        .is_some_and(|s| !s.trim().is_empty());
    let (max_tokens, temperature) = if has_suffix {
        (MAX_COMPLETION_TOKENS, 0.3)
    } else {
        (64usize, 0.2)
    };

    let payload = build_openai_compatible_payload(
        provider,
        model,
        system_prompt,
        user_prompt,
        max_tokens,
        temperature,
        false,
    );

    let response = client
        .post(join_url(&api_url, "/v1/chat/completions"))
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            let err = error.to_string();
            i18n::tf(
                "ai.provider.request_failed",
                &[("provider", provider.display_name()), ("error", &err)],
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| i18n::t("ai.read_error_details_failed"));

        let status_str = status.as_u16().to_string();
        return Err(i18n::tf(
            "ai.provider.api_error",
            &[
                ("provider", provider.display_name()),
                ("status", &status_str),
                ("body", &body),
            ],
        ));
    }

    let payload = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|error| {
            let err = error.to_string();
            i18n::tf(
                "ai.provider.parse_response_failed",
                &[("provider", provider.display_name()), ("error", &err)],
            )
        })?;

    Ok(take_chat_completion(payload))
}

pub(crate) async fn request_openai_compatible_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::OpenAi);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_openai_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt = prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context);
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context);

    let has_suffix = request
        .suffix
        .as_deref()
        .is_some_and(|s| !s.trim().is_empty());
    let (max_tokens, temperature) = if has_suffix {
        (MAX_COMPLETION_TOKENS, 0.3)
    } else {
        (64usize, 0.2)
    };

    let payload = build_openai_compatible_payload(
        provider,
        model,
        system_prompt,
        user_prompt,
        max_tokens,
        temperature,
        true,
    );

    let response = client
        .post(join_url(&api_url, "/v1/chat/completions"))
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            let err = error.to_string();
            i18n::tf(
                "ai.provider.request_stream_failed",
                &[("provider", provider.display_name()), ("error", &err)],
            )
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| i18n::t("ai.read_error_details_failed"));

        let status_str = status.as_u16().to_string();
        return Err(i18n::tf(
            "ai.provider.stream_api_error",
            &[
                ("provider", provider.display_name()),
                ("status", &status_str),
                ("body", &body),
            ],
        ));
    }

    let mut completion = String::new();
    stream_sse_response(response, |event| {
        if event.data == "[DONE]" {
            return Ok(());
        }

        let payload = serde_json::from_str::<StreamingChatCompletionResponse>(&event.data)
            .map_err(|error| {
                let err = error.to_string();
                i18n::tf(
                    "ai.provider.parse_stream_response_failed",
                    &[("provider", provider.display_name()), ("error", &err)],
                )
            })?;
        let chunk = take_stream_chat_completion(payload);
        if chunk.is_empty() {
            return Ok(());
        }

        completion.push_str(&chunk);
        on_chunk(chunk)
    })
    .await?;

    Ok(completion)
}

fn take_stream_chat_completion(payload: StreamingChatCompletionResponse) -> String {
    payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| {
            choice
                .delta
                .and_then(|delta| delta.content)
                .or(choice.text)
                .or(choice.message.and_then(|message| message.content))
        })
        .unwrap_or_default()
}

fn build_openai_compatible_payload(
    provider: AiProvider,
    model: &str,
    system_prompt: String,
    user_prompt: String,
    max_tokens: usize,
    temperature: f32,
    stream: bool,
) -> Value {
    let mut payload = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            }
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stop": STOP_SEQUENCES,
    });

    if let Some(object) = payload.as_object_mut() {
        if stream {
            object.insert("stream".to_string(), json!(true));
        }

        // Some OpenAI-compatible reasoning models default to thinking-on and can
        // spend the entire completion budget on hidden reasoning. Explicitly turn
        // that off for providers/models that document a compatibility switch.
        let lower_model = model.to_ascii_lowercase();
        if lower_model.starts_with("qwen") {
            object.insert("enable_thinking".to_string(), json!(false));
        } else if should_disable_structured_thinking(provider, &lower_model) {
            object.insert("thinking".to_string(), json!({ "type": "disabled" }));
        }
    }

    payload
}

fn should_disable_structured_thinking(provider: AiProvider, lower_model: &str) -> bool {
    matches!(
        provider,
        AiProvider::DeepSeek | AiProvider::Kimi | AiProvider::Zhipu | AiProvider::ZhipuCoding
    ) || lower_model.starts_with("deepseek-")
        || lower_model.starts_with("glm-")
        || lower_model.starts_with("kimi-")
}

#[cfg(test)]
mod tests {
    use super::{build_openai_compatible_payload, should_disable_structured_thinking};
    use crate::{models::ai::AiProvider, providers::common::STOP_SEQUENCES};
    use serde_json::json;

    #[test]
    fn disables_structured_thinking_for_known_openai_compatible_reasoners() {
        assert!(should_disable_structured_thinking(
            AiProvider::DeepSeek,
            "deepseek-v4-pro"
        ));
        assert!(should_disable_structured_thinking(
            AiProvider::Zhipu,
            "glm-5.2"
        ));
        assert!(should_disable_structured_thinking(
            AiProvider::Kimi,
            "kimi-k2.6"
        ));
        assert!(!should_disable_structured_thinking(
            AiProvider::OpenAi,
            "gpt-4o-mini"
        ));
    }

    #[test]
    fn adds_qwen_thinking_override_to_payload() {
        let payload = build_openai_compatible_payload(
            AiProvider::Custom,
            "qwen3.7-max",
            "system".to_string(),
            "user".to_string(),
            64,
            0.2,
            true,
        );

        assert_eq!(payload["enable_thinking"], json!(false));
        assert_eq!(payload["stream"], json!(true));
        assert_eq!(payload["stop"], json!(STOP_SEQUENCES));
    }

    #[test]
    fn adds_structured_thinking_override_to_payload() {
        let payload = build_openai_compatible_payload(
            AiProvider::OpenCodeZen,
            "deepseek-v4-pro",
            "system".to_string(),
            "user".to_string(),
            64,
            0.2,
            false,
        );

        assert_eq!(payload["thinking"], json!({ "type": "disabled" }));
        assert!(payload.get("stream").is_none());
    }
}
