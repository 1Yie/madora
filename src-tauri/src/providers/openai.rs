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
            build_prompt_context, detect_error_payload, join_url, parse_success_json,
            read_error_body, resolve_api_key, send_with_status_retries, stream_sse_response,
            summarize_error_body, take_chat_completion, ChatCompletionMessage,
            ChatCompletionResponse, CompletionParams, OpenEndedStop, NON_STREAM_REQUEST_TIMEOUT,
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
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload =
        build_openai_compatible_payload(provider, model, system_prompt, user_prompt, params, false);

    let response = send_with_status_retries(|| {
        client
            .post(join_url(&api_url, "/v1/chat/completions"))
            .bearer_auth(api_key)
            .timeout(NON_STREAM_REQUEST_TIMEOUT)
            .json(&payload)
    })
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
        let body = read_error_body(response).await;

        let status_str = status.as_u16().to_string();
        return Err(i18n::tf(
            "ai.provider.api_error",
            &[
                ("provider", provider.display_name()),
                ("status", &status_str),
                ("body", &summarize_error_body(&body)),
            ],
        ));
    }

    let payload =
        parse_success_json::<ChatCompletionResponse>(provider.display_name(), response).await?;

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
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload =
        build_openai_compatible_payload(provider, model, system_prompt, user_prompt, params, true);

    let response = send_with_status_retries(|| {
        client
            .post(join_url(&api_url, "/v1/chat/completions"))
            .bearer_auth(api_key)
            .json(&payload)
    })
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
        let body = read_error_body(response).await;

        let status_str = status.as_u16().to_string();
        return Err(i18n::tf(
            "ai.provider.stream_api_error",
            &[
                ("provider", provider.display_name()),
                ("status", &status_str),
                ("body", &summarize_error_body(&body)),
            ],
        ));
    }

    let mut completion = String::new();
    stream_sse_response(response, |event| {
        if event.data == "[DONE]" {
            return Ok(());
        }

        if let Some(message) = detect_error_payload(&event.data) {
            return Err(i18n::tf(
                "ai.provider.stream_api_error",
                &[
                    ("provider", provider.display_name()),
                    ("status", "200"),
                    ("body", &message),
                ],
            ));
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
    params: CompletionParams,
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
        "max_tokens": params.max_tokens,
        "temperature": params.temperature,
        "stop": params.stop,
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
    use crate::{
        models::ai::AiProvider,
        providers::common::{CompletionParams, STOP_SEQUENCES},
    };
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
            CompletionParams {
                max_tokens: 64,
                temperature: 0.2,
                stop: STOP_SEQUENCES,
            },
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
            CompletionParams {
                max_tokens: 64,
                temperature: 0.2,
                stop: STOP_SEQUENCES,
            },
            false,
        );

        assert_eq!(payload["thinking"], json!({ "type": "disabled" }));
        assert!(payload.get("stream").is_none());
    }

    #[test]
    fn payload_carries_the_shared_completion_params() {
        let params = CompletionParams {
            max_tokens: 123,
            temperature: 0.5,
            stop: &["X", "Y"],
        };
        let payload = build_openai_compatible_payload(
            AiProvider::OpenAi,
            "gpt-4o-mini",
            "system".to_string(),
            "user".to_string(),
            params,
            false,
        );

        assert_eq!(payload["max_tokens"], json!(123));
        assert_eq!(payload["temperature"], json!(0.5));
        assert_eq!(payload["stop"], json!(["X", "Y"]));
    }
}
