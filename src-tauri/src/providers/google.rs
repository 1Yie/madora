use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    i18n,
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_google_compatible, PromptManager},
    providers::{
        common::{
            build_prompt_context, detect_error_payload, join_url, parse_success_json,
            read_error_body, resolve_api_key, send_with_status_retries, stream_sse_response,
            summarize_error_body, CompletionParams, OpenEndedStop, NON_STREAM_REQUEST_TIMEOUT,
        },
        default_api_url, default_model, resolve_api_url, resolve_model, CompletionProvider,
    },
};

pub struct GoogleProvider;

#[async_trait]
impl CompletionProvider for GoogleProvider {
    fn provider(&self) -> AiProvider {
        AiProvider::Google
    }

    async fn request_fim_completion(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        request_google_compatible_fim(client, prompt_manager, config, request).await
    }

    async fn request_fim_completion_stream(
        &self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        request_google_compatible_fim_stream(client, prompt_manager, config, request, on_chunk)
            .await
    }
}

#[derive(Deserialize)]
struct GooglePart {
    text: Option<String>,
    thought: Option<bool>,
}

#[derive(Deserialize)]
struct GoogleContent {
    parts: Option<Vec<GooglePart>>,
}

#[derive(Deserialize)]
struct GoogleCandidate {
    content: Option<GoogleContent>,
}

#[derive(Deserialize)]
struct GoogleGenerateContentResponse {
    candidates: Option<Vec<GoogleCandidate>>,
}

pub(crate) async fn request_google_compatible_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::Google);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_google_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload = build_google_payload(model, system_prompt, user_prompt, params);

    let response = send_with_status_retries(|| {
        client
            .post(google_generate_content_url(&api_url, model, false))
            .header("x-goog-api-key", api_key)
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
        parse_success_json::<GoogleGenerateContentResponse>(provider.display_name(), response)
            .await?;

    Ok(take_google_text(payload))
}

pub(crate) async fn request_google_compatible_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let provider = config.provider.unwrap_or(AiProvider::Google);
    let api_key = resolve_api_key(config)?;
    let api_url = resolve_api_url(config, default_api_url(provider).unwrap_or_default())?;
    let model = resolve_model(config, default_model(provider).unwrap_or_default())?;
    let prompt_profile = prompt_profile_for_google_compatible(provider, model);
    let prompt_context = build_prompt_context(request);
    let system_prompt =
        prompt_manager.render_prompt(prompt_profile, "fim_system", &prompt_context)?;
    let user_prompt = prompt_manager.render_prompt(prompt_profile, "fim_user", &prompt_context)?;

    let params = CompletionParams::for_request(request, OpenEndedStop::Structural);

    let payload = build_google_payload(model, system_prompt, user_prompt, params);

    let response = send_with_status_retries(|| {
        client
            .post(google_generate_content_url(&api_url, model, true))
            .header("x-goog-api-key", api_key)
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
        if event.data.trim().is_empty() {
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

        let payload = serde_json::from_str::<GoogleGenerateContentResponse>(&event.data).map_err(
            |error| {
                let err = error.to_string();
                i18n::tf(
                    "ai.provider.parse_stream_response_failed",
                    &[("provider", provider.display_name()), ("error", &err)],
                )
            },
        )?;
        let chunk = take_google_text(payload);
        if chunk.is_empty() {
            return Ok(());
        }

        completion.push_str(&chunk);
        on_chunk(chunk)
    })
    .await?;

    Ok(completion)
}

fn google_generate_content_url(api_url: &str, model: &str, stream: bool) -> String {
    let suffix = if stream {
        ":streamGenerateContent?alt=sse"
    } else {
        ":generateContent"
    };

    join_url(api_url, &format!("/v1/models/{model}{suffix}"))
}

fn build_google_payload(
    model: &str,
    system_prompt: String,
    user_prompt: String,
    params: CompletionParams,
) -> Value {
    let mut generation_config = json!({
        "maxOutputTokens": params.max_tokens,
        "responseMimeType": "text/plain",
        "stopSequences": params.stop,
        "temperature": params.temperature,
    });

    let lower_model = model.to_ascii_lowercase();
    if let Some(thinking_config) = google_thinking_config(&lower_model) {
        generation_config["thinkingConfig"] = thinking_config;
    }

    json!({
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": user_prompt,
                    }
                ],
            }
        ],
        "generationConfig": generation_config,
        "store": false,
        "systemInstruction": {
            "parts": [
                {
                    "text": system_prompt,
                }
            ]
        },
    })
}

fn google_thinking_config(lower_model: &str) -> Option<Value> {
    if lower_model.starts_with("gemini-3.1-pro") {
        // Gemini 3.1 Pro cannot fully disable thinking. Low is the least
        // expensive supported level and reduces the risk of exhausting the
        // output budget before any completion text is emitted.
        return Some(json!({ "thinkingLevel": "low" }));
    }

    if lower_model.starts_with("gemini-3") {
        // Gemini 3 Flash variants do not support full thinking-off. Minimal is
        // the closest setting to "no thinking" for simple code completion.
        return Some(json!({ "thinkingLevel": "minimal" }));
    }

    if lower_model.starts_with("gemini-2.5-pro") {
        // Gemini 2.5 Pro cannot disable thinking entirely.
        return Some(json!({ "thinkingBudget": 128 }));
    }

    if lower_model.starts_with("gemini-2.5-") {
        return Some(json!({ "thinkingBudget": 0 }));
    }

    None
}

fn take_google_text(payload: GoogleGenerateContentResponse) -> String {
    payload
        .candidates
        .and_then(|candidates| candidates.into_iter().next())
        .and_then(|candidate| candidate.content)
        .and_then(|content| content.parts)
        .map(|parts| {
            parts
                .into_iter()
                .filter(|part| !part.thought.unwrap_or(false))
                .filter_map(|part| part.text)
                .collect::<String>()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        build_google_payload, google_generate_content_url, google_thinking_config,
        take_google_text, GoogleGenerateContentResponse,
    };
    use crate::providers::common::{CompletionParams, STOP_SEQUENCES};
    use serde_json::json;

    #[test]
    fn builds_google_stream_url() {
        assert_eq!(
            google_generate_content_url("https://opencode.ai/zen", "gemini-3.1-pro", true),
            "https://opencode.ai/zen/v1/models/gemini-3.1-pro:streamGenerateContent?alt=sse"
        );
    }

    #[test]
    fn uses_conservative_thinking_controls_for_gemini_models() {
        assert_eq!(
            google_thinking_config("gemini-3.1-pro"),
            Some(json!({ "thinkingLevel": "low" }))
        );
        assert_eq!(
            google_thinking_config("gemini-3-flash"),
            Some(json!({ "thinkingLevel": "minimal" }))
        );
        assert_eq!(
            google_thinking_config("gemini-2.5-flash"),
            Some(json!({ "thinkingBudget": 0 }))
        );
    }

    #[test]
    fn includes_google_generation_config_in_payload() {
        let payload = build_google_payload(
            "gemini-3.5-flash",
            "system".to_string(),
            "user".to_string(),
            CompletionParams {
                max_tokens: 64,
                temperature: 0.2,
                stop: STOP_SEQUENCES,
            },
        );

        assert_eq!(payload["generationConfig"]["maxOutputTokens"], json!(64));
        assert_eq!(
            payload["generationConfig"]["thinkingConfig"],
            json!({ "thinkingLevel": "minimal" })
        );
        assert_eq!(payload["store"], json!(false));
    }

    #[test]
    fn ignores_thought_parts_when_extracting_text() {
        let payload: GoogleGenerateContentResponse = serde_json::from_value(json!({
            "candidates": [
                {
                    "content": {
                        "parts": [
                            { "text": "internal", "thought": true },
                            { "text": "answer" }
                        ]
                    }
                }
            ]
        }))
        .unwrap();

        assert_eq!(take_google_text(payload), "answer");
    }

    #[test]
    fn payload_carries_the_shared_completion_params() {
        let params = CompletionParams {
            max_tokens: 123,
            temperature: 0.5,
            stop: &["X", "Y"],
        };
        let payload = build_google_payload(
            "gemini-2.5-flash",
            "system".to_string(),
            "user".to_string(),
            params,
        );
        let config = &payload["generationConfig"];

        assert_eq!(config["maxOutputTokens"], json!(123));
        assert_eq!(config["temperature"], json!(0.5));
        assert_eq!(config["stopSequences"], json!(["X", "Y"]));
    }
}
