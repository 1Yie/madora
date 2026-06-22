use async_trait::async_trait;
use reqwest::{Client, RequestBuilder};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_anthropic_compatible, PromptManager},
    providers::{
        common::{
            build_prompt_context, join_url, resolve_api_key, stream_sse_response,
            MAX_COMPLETION_TOKENS, STOP_SEQUENCES,
        },
        default_api_url, default_model, resolve_api_url, resolve_model, CompletionProvider,
    },
};

const ANTHROPIC_API_VERSION: &str = "2023-06-01";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AnthropicAuthMode {
    Bearer,
    XApiKey,
}

#[derive(Deserialize)]
struct AnthropicTextBlock {
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicMessageResponse {
    content: Option<Vec<AnthropicTextBlock>>,
}

#[derive(Deserialize)]
struct AnthropicStreamDelta {
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicStreamContentBlock {
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicMessageStreamResponse {
    content_block: Option<AnthropicStreamContentBlock>,
    delta: Option<AnthropicStreamDelta>,
}

pub struct AnthropicProvider;

#[async_trait]
impl CompletionProvider for AnthropicProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::Anthropic
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        request_anthropic_compatible_fim(client, prompt_manager, config, request).await
    }

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        request_anthropic_compatible_fim_stream(client, prompt_manager, config, request, on_chunk)
            .await
    }
}

pub(crate) async fn request_anthropic_compatible_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::Anthropic);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_anthropic_compatible(provider, model);
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

    let payload = build_anthropic_compatible_payload(
        provider,
        model,
        system_prompt,
        user_prompt,
        max_tokens,
        temperature,
        false,
    );

    let response = apply_anthropic_auth(
        client
            .post(join_url(&api_url, "/v1/messages"))
            .header("anthropic-version", ANTHROPIC_API_VERSION)
            .json(&payload),
        auth_mode_for_provider(provider),
        api_key,
    )
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
        .json::<AnthropicMessageResponse>()
        .await
        .map_err(|error| {
            let err = error.to_string();
            i18n::tf(
                "ai.provider.parse_response_failed",
                &[("provider", provider.display_name()), ("error", &err)],
            )
        })?;

    Ok(payload
        .content
        .and_then(|content| content.into_iter().next())
        .and_then(|block| block.text)
        .unwrap_or_default())
}

pub(crate) async fn request_anthropic_compatible_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::Anthropic);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_anthropic_compatible(provider, model);
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

    let payload = build_anthropic_compatible_payload(
        provider,
        model,
        system_prompt,
        user_prompt,
        max_tokens,
        temperature,
        true,
    );

    let response = apply_anthropic_auth(
        client
            .post(join_url(&api_url, "/v1/messages"))
            .header("anthropic-version", ANTHROPIC_API_VERSION)
            .json(&payload),
        auth_mode_for_provider(provider),
        api_key,
    )
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
        let payload = serde_json::from_str::<AnthropicMessageStreamResponse>(&event.data).map_err(
            |error| {
                let err = error.to_string();
                i18n::tf(
                    "ai.provider.parse_stream_response_failed",
                    &[("provider", provider.display_name()), ("error", &err)],
                )
            },
        )?;
        let chunk = take_anthropic_stream_text(payload);
        if chunk.is_empty() {
            return Ok(());
        }

        completion.push_str(&chunk);
        on_chunk(chunk)
    })
    .await?;

    Ok(completion)
}

fn take_anthropic_stream_text(payload: AnthropicMessageStreamResponse) -> String {
    payload
        .delta
        .and_then(|delta| delta.text)
        .or(payload.content_block.and_then(|block| block.text))
        .unwrap_or_default()
}

fn auth_mode_for_provider(provider: AiProvider) -> AnthropicAuthMode {
    match provider {
        AiProvider::MiniMax | AiProvider::MiniMaxCoding => AnthropicAuthMode::Bearer,
        _ => AnthropicAuthMode::XApiKey,
    }
}

fn apply_anthropic_auth(
    request: RequestBuilder,
    auth_mode: AnthropicAuthMode,
    api_key: &str,
) -> RequestBuilder {
    match auth_mode {
        AnthropicAuthMode::Bearer => request.bearer_auth(api_key),
        AnthropicAuthMode::XApiKey => request.header("x-api-key", api_key),
    }
}

fn build_anthropic_compatible_payload(
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
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": user_prompt,
            }
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stop_sequences": STOP_SEQUENCES,
    });

    if let Some(object) = payload.as_object_mut() {
        if stream {
            object.insert("stream".to_string(), json!(true));
        }

        // Native Anthropic requests are thinking-off by omission, but some
        // Anthropic-compatible Qwen endpoints default to thinking-on unless the
        // request explicitly disables it.
        let lower_model = model.to_ascii_lowercase();
        if should_disable_anthropic_thinking(provider, &lower_model) {
            object.insert("thinking".to_string(), json!({ "type": "disabled" }));
        }
    }

    payload
}

fn should_disable_anthropic_thinking(provider: AiProvider, lower_model: &str) -> bool {
    !matches!(provider, AiProvider::Anthropic) && lower_model.starts_with("qwen")
}

#[cfg(test)]
mod tests {
    use super::{
        auth_mode_for_provider, build_anthropic_compatible_payload,
        should_disable_anthropic_thinking, AnthropicAuthMode,
    };
    use crate::models::ai::AiProvider;
    use serde_json::json;

    #[test]
    fn uses_bearer_auth_for_minimax_compatible_providers() {
        assert_eq!(
            auth_mode_for_provider(AiProvider::MiniMax),
            AnthropicAuthMode::Bearer
        );
        assert_eq!(
            auth_mode_for_provider(AiProvider::MiniMaxCoding),
            AnthropicAuthMode::Bearer
        );
        assert_eq!(
            auth_mode_for_provider(AiProvider::Anthropic),
            AnthropicAuthMode::XApiKey
        );
    }

    #[test]
    fn disables_qwen_thinking_for_anthropic_compatibility() {
        assert!(should_disable_anthropic_thinking(
            AiProvider::OpenCodeGo,
            "qwen3.7-max"
        ));
        assert!(should_disable_anthropic_thinking(
            AiProvider::Custom,
            "qwen3.6-plus"
        ));
        assert!(!should_disable_anthropic_thinking(
            AiProvider::Anthropic,
            "claude-sonnet-4-5"
        ));
    }

    #[test]
    fn adds_explicit_thinking_disable_to_qwen_payload() {
        let payload = build_anthropic_compatible_payload(
            AiProvider::OpenCodeZen,
            "qwen3.7-max",
            "system".to_string(),
            "user".to_string(),
            64,
            0.2,
            true,
        );

        assert_eq!(payload["thinking"], json!({ "type": "disabled" }));
        assert_eq!(payload["stream"], json!(true));
    }

    #[test]
    fn leaves_claude_payload_without_explicit_thinking_override() {
        let payload = build_anthropic_compatible_payload(
            AiProvider::Anthropic,
            "claude-3-5-sonnet-latest",
            "system".to_string(),
            "user".to_string(),
            64,
            0.2,
            false,
        );

        assert!(payload.get("thinking").is_none());
    }
}
