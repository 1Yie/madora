use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_openai_compatible, PromptManager},
    providers::{
        anthropic::{request_anthropic_compatible_fim, request_anthropic_compatible_fim_stream},
        common::{
            build_prompt_context, detect_error_payload, join_url, parse_success_json,
            read_error_body, resolve_api_key, send_with_status_retries, stream_sse_response,
            summarize_error_body, CompletionParams, OpenEndedStop, NON_STREAM_REQUEST_TIMEOUT,
        },
        default_api_url, default_model,
        google::{request_google_compatible_fim, request_google_compatible_fim_stream},
        openai::{request_openai_compatible_fim, request_openai_compatible_fim_stream},
        resolve_api_url, resolve_model, CompletionProvider,
    },
};

pub struct OpenCodeZenProvider;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OpenCodeZenRoute {
    Anthropic,
    Google,
    ChatCompletions,
    Responses,
}

#[derive(Deserialize)]
struct ResponsesApiOutputContent {
    text: Option<String>,
    #[serde(rename = "type")]
    type_name: Option<String>,
}

#[derive(Deserialize)]
struct ResponsesApiOutputItem {
    content: Option<Vec<ResponsesApiOutputContent>>,
    #[serde(rename = "type")]
    type_name: Option<String>,
}

#[derive(Deserialize)]
struct ResponsesApiResponse {
    output: Option<Vec<ResponsesApiOutputItem>>,
    output_text: Option<String>,
}

#[derive(Deserialize)]
struct ResponsesApiStreamEvent {
    delta: Option<String>,
    response: Option<ResponsesApiResponse>,
    text: Option<String>,
    #[serde(rename = "type")]
    type_name: Option<String>,
}

#[async_trait]
impl CompletionProvider for OpenCodeZenProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::OpenCodeZen
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        match resolve_route(config)? {
            OpenCodeZenRoute::Anthropic => {
                request_anthropic_compatible_fim(client, prompt_manager, config, request).await
            }
            OpenCodeZenRoute::Google => {
                request_google_compatible_fim(client, prompt_manager, config, request).await
            }
            OpenCodeZenRoute::ChatCompletions => {
                request_openai_compatible_fim(client, prompt_manager, config, request).await
            }
            OpenCodeZenRoute::Responses => {
                request_openai_responses_fim(client, prompt_manager, config, request).await
            }
        }
    }

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        match resolve_route(config)? {
            OpenCodeZenRoute::Anthropic => {
                request_anthropic_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            OpenCodeZenRoute::Google => {
                request_google_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            OpenCodeZenRoute::ChatCompletions => {
                request_openai_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            OpenCodeZenRoute::Responses => {
                request_openai_responses_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
        }
    }
}

fn resolve_route(config: &AiCompletionConfig) -> Result<OpenCodeZenRoute, String> {
    let model = resolve_model(
        config,
        default_model(AiProvider::OpenCodeZen).unwrap_or_default(),
    )?;
    let normalized = model.trim().to_ascii_lowercase();

    if matches_responses_route(&normalized) {
        return Ok(OpenCodeZenRoute::Responses);
    }

    if matches_anthropic_route(&normalized) {
        return Ok(OpenCodeZenRoute::Anthropic);
    }

    if matches_google_route(&normalized) {
        return Ok(OpenCodeZenRoute::Google);
    }

    if matches_chat_completions_route(&normalized) {
        return Ok(OpenCodeZenRoute::ChatCompletions);
    }

    Err(format!(
        "OpenCode Zen model '{model}' could not be routed to an API endpoint."
    ))
}

fn matches_responses_route(model: &str) -> bool {
    model.starts_with("gpt-")
}

fn matches_anthropic_route(model: &str) -> bool {
    model.starts_with("claude-") || model.starts_with("qwen")
}

fn matches_google_route(model: &str) -> bool {
    model.starts_with("gemini-")
}

fn matches_chat_completions_route(model: &str) -> bool {
    model.starts_with("deepseek-")
        || model.starts_with("minimax-")
        || model.starts_with("glm-")
        || model.starts_with("kimi-")
        || model.starts_with("grok-")
        || model == "big-pickle"
        || model.starts_with("mimo-")
        || model.starts_with("north-mini-code-")
        || model.starts_with("nemotron-")
}

async fn request_openai_responses_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::OpenCodeZen);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_openai_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload = build_responses_payload(model, system_prompt, user_prompt, params, false);

    let response = send_with_status_retries(|| {
        client
            .post(join_url(&api_url, "/v1/responses"))
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
        parse_success_json::<ResponsesApiResponse>(provider.display_name(), response).await?;

    Ok(take_responses_output_text(payload))
}

async fn request_openai_responses_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::OpenCodeZen);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_openai_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload = build_responses_payload(model, system_prompt, user_prompt, params, true);

    let response = send_with_status_retries(|| {
        client
            .post(join_url(&api_url, "/v1/responses"))
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
        if event.data == "[DONE]" || event.data.trim().is_empty() {
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

        let payload =
            serde_json::from_str::<ResponsesApiStreamEvent>(&event.data).map_err(|error| {
                let err = error.to_string();
                i18n::tf(
                    "ai.provider.parse_stream_response_failed",
                    &[("provider", provider.display_name()), ("error", &err)],
                )
            })?;
        let chunk = take_responses_stream_text(payload, completion.is_empty());
        if chunk.is_empty() {
            return Ok(());
        }

        completion.push_str(&chunk);
        on_chunk(chunk)
    })
    .await?;

    Ok(completion)
}

fn build_responses_payload(
    model: &str,
    system_prompt: String,
    user_prompt: String,
    params: CompletionParams,
    stream: bool,
) -> Value {
    // The Responses API has no stop-sequence parameter, so only the budget and
    // temperature carry over.
    json!({
        "model": model,
        "input": user_prompt,
        "instructions": system_prompt,
        "max_output_tokens": params.max_tokens,
        "temperature": params.temperature,
        "store": false,
        "stream": stream,
    })
}

fn take_responses_output_text(payload: ResponsesApiResponse) -> String {
    payload.output_text.unwrap_or_else(|| {
        payload
            .output
            .unwrap_or_default()
            .into_iter()
            .filter(|item| item.type_name.as_deref() == Some("message"))
            .flat_map(|item| item.content.unwrap_or_default().into_iter())
            .filter(|content| content.type_name.as_deref() == Some("output_text"))
            .filter_map(|content| content.text)
            .collect::<Vec<_>>()
            .join("")
    })
}

fn take_responses_stream_text(
    payload: ResponsesApiStreamEvent,
    allow_completion_fallback: bool,
) -> String {
    match payload.type_name.as_deref() {
        Some("response.output_text.delta") => payload.delta.or(payload.text).unwrap_or_default(),
        Some("response.completed") if allow_completion_fallback => payload
            .response
            .map(take_responses_output_text)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::AiCompletionConfig;

    fn config_with_model(model: &str) -> AiCompletionConfig {
        AiCompletionConfig {
            model: Some(model.to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn resolves_responses_models() {
        let route = resolve_route(&config_with_model("gpt-5.5")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Responses);

        let route = resolve_route(&config_with_model("gpt-5.1-codex-max")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Responses);
    }

    #[test]
    fn resolves_chat_completion_models() {
        let route = resolve_route(&config_with_model("deepseek-v4-pro")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::ChatCompletions);

        let route = resolve_route(&config_with_model("big-pickle")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::ChatCompletions);
    }

    #[test]
    fn resolves_anthropic_models() {
        let route = resolve_route(&config_with_model("claude-sonnet-4-6")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Anthropic);

        let route = resolve_route(&config_with_model("qwen3.5-plus")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Anthropic);
    }

    #[test]
    fn resolves_google_models() {
        let route = resolve_route(&config_with_model("gemini-3.1-pro")).unwrap();
        assert_eq!(route, OpenCodeZenRoute::Google);
    }

    #[test]
    fn extracts_response_output_text() {
        let text = take_responses_output_text(ResponsesApiResponse {
            output: Some(vec![ResponsesApiOutputItem {
                content: Some(vec![ResponsesApiOutputContent {
                    text: Some("hello".to_string()),
                    type_name: Some("output_text".to_string()),
                }]),
                type_name: Some("message".to_string()),
            }]),
            output_text: None,
        });

        assert_eq!(text, "hello");
    }

    #[test]
    fn returns_route_error_for_unmatched_models() {
        let error = resolve_route(&config_with_model("unknown-model")).unwrap_err();
        assert!(error.contains("could not be routed"));
    }
}
