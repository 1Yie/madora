//! Shared OpenAI Responses HTTP protocol (including OpenCode Zen routes).

use super::common::{
    detect_error_payload, parse_stream_event, parse_success_json, send_request,
    stream_sse_response_until, CompletionKind, CompletionParams, OpenEndedStop, PreparedCompletion,
    MAX_SSE_BUFFER_BYTES,
};
use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::{prompt_profile_for_openai_compatible, PromptManager},
};
use reqwest::{Client, Url};
use serde::Deserialize;
use serde_json::{json, Value};

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
pub(super) struct ResponsesApiResponse {
    output: Option<Vec<ResponsesApiOutputItem>>,
    output_text: Option<String>,
    status: Option<String>,
    error: Option<Value>,
    incomplete_details: Option<Value>,
}

#[derive(Deserialize)]
pub(super) struct ResponsesApiStreamEvent {
    delta: Option<String>,
    response: Option<ResponsesApiResponse>,
    text: Option<String>,
    #[serde(rename = "type")]
    type_name: Option<String>,
}

/// Accept an origin, versioned API base, or a complete Responses endpoint.
/// Credentials are only allowed in the Authorization header, never in a URL.
pub(super) fn responses_endpoint(base: &str) -> Result<Url, String> {
    let mut url = Url::parse(base).map_err(|_| "Invalid Responses API URL".to_string())?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Responses API URLs must not contain credentials, query parameters or fragments".into(),
        );
    }
    let path = url.path().trim_end_matches('/');
    let path = if path.ends_with("/responses") {
        path.to_string()
    } else if path.ends_with("/v1") {
        format!("{path}/responses")
    } else {
        format!("{path}/v1/responses")
    };
    url.set_path(&path);
    Ok(url)
}

fn validate_response(response: &ResponsesApiResponse, terminal: bool) -> Result<(), String> {
    if response.error.is_some()
        || response.incomplete_details.is_some()
        || matches!(
            response.status.as_deref(),
            Some("failed" | "incomplete" | "cancelled")
        )
        || (terminal
            && response
                .status
                .as_deref()
                .is_some_and(|status| status != "completed"))
    {
        let detail = response
            .error
            .as_ref()
            .or(response.incomplete_details.as_ref())
            .map(Value::to_string)
            .unwrap_or_default();
        return Err(format!(
            "Responses request {}: {}",
            response.status.as_deref().unwrap_or("failed"),
            super::common::summarize_error_body(&detail)
        ));
    }
    Ok(())
}

/// Shared by SSE and WebSocket: failure/incomplete is not a cacheable success.
pub(super) fn check_stream_event(event: &ResponsesApiStreamEvent) -> Result<bool, String> {
    if let Some(response) = &event.response {
        validate_response(
            response,
            event.type_name.as_deref() == Some("response.completed"),
        )?;
    }
    match event.type_name.as_deref() {
        Some("response.failed" | "response.incomplete" | "response.cancelled" | "error") => {
            Err(format!(
                "Responses request ended with {}",
                event.type_name.as_deref().unwrap()
            ))
        }
        Some("response.completed") => Ok(true),
        _ => Ok(false),
    }
}

pub(crate) async fn request_openai_responses_fim(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let PreparedCompletion {
        connection,
        system_prompt,
        user_prompt,
    } = PreparedCompletion::prepare(
        prompt_manager,
        config,
        request,
        prompt_profile_for_openai_compatible,
        AiProvider::OpenCodeZen,
        OpenEndedStop::Structural,
    )?;
    let provider = connection.provider;
    let endpoint = responses_endpoint(&connection.api_url)?;
    let payload = build_responses_payload(
        &connection.model,
        system_prompt,
        user_prompt,
        connection.params,
        false,
    );

    let response = send_request(CompletionKind::Whole, provider, || {
        client
            .post(endpoint.clone())
            .bearer_auth(&connection.api_key)
            .json(&payload)
    })
    .await?;

    let payload =
        parse_success_json::<ResponsesApiResponse>(provider.display_name(), response).await?;

    validate_response(&payload, true)?;
    Ok(take_responses_output_text(payload))
}

pub(crate) async fn request_openai_responses_fim_stream(
    client: &Client,
    prompt_manager: &PromptManager,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
) -> Result<String, String> {
    let PreparedCompletion {
        connection,
        system_prompt,
        user_prompt,
    } = PreparedCompletion::prepare(
        prompt_manager,
        config,
        request,
        prompt_profile_for_openai_compatible,
        AiProvider::OpenCodeZen,
        OpenEndedStop::Structural,
    )?;
    let provider = connection.provider;
    let endpoint = responses_endpoint(&connection.api_url)?;
    let payload = build_responses_payload(
        &connection.model,
        system_prompt,
        user_prompt,
        connection.params,
        true,
    );

    let response = send_request(CompletionKind::Stream, provider, || {
        client
            .post(endpoint.clone())
            .bearer_auth(&connection.api_key)
            .json(&payload)
    })
    .await?;

    let mut completed = false;
    let mut completion = String::new();
    stream_sse_response_until(response, |event| {
        if event.data.trim() == "[DONE]" {
            return Ok(true);
        }
        if let Some(error) = detect_error_payload(&event.data) {
            return Err(format!("Responses stream error: {error}"));
        }
        let payload = parse_stream_event::<ResponsesApiStreamEvent>(provider, &event)?;
        completed = check_stream_event(&payload)?;
        // Only fall back to the completed event's full text when nothing
        // streamed, or the answer would be emitted twice.
        let chunk = take_responses_stream_text(payload, completion.is_empty());

        if !chunk.is_empty() {
            if provider == AiProvider::Custom
                && completion.len().saturating_add(chunk.len()) > MAX_SSE_BUFFER_BYTES
            {
                return Err("Responses stream exceeds the 1 MiB output limit".into());
            }
            completion.push_str(&chunk);
            on_chunk(chunk)?;
        }
        Ok(completed)
    })
    .await?;
    if !completed && provider == AiProvider::Custom {
        return Err("Responses stream closed before response.completed".into());
    }
    Ok(completion)
}

pub(super) fn build_responses_payload(
    model: &str,
    system_prompt: String,
    user_prompt: String,
    params: CompletionParams,
    stream: bool,
) -> Value {
    // The Responses API has no stop-sequence parameter, so only the budget and
    // temperature carry over.
    let mut payload = json!({
        "model": model,
        "input": user_prompt,
        "instructions": system_prompt,
        "max_output_tokens": params.max_tokens,
        "temperature": params.temperature,
        "store": false,
        "stream": stream,
    });
    if let Some(effort) = gpt_reasoning_effort(model) {
        payload["reasoning"] = json!({ "effort": effort });
        if effort != "none" {
            payload.as_object_mut().unwrap().remove("temperature");
            // The output limit also pays for hidden reasoning tokens.
            payload["max_output_tokens"] = json!(params.max_tokens.max(512));
        }
    }
    payload
}

fn gpt_reasoning_effort(model: &str) -> Option<&'static str> {
    let normalized = model.trim().to_ascii_lowercase();
    // Codex reasoning models commonly reject temperature. Low is supported
    // across the GPT-5 Codex family and leaves room for visible output.
    if normalized.starts_with("gpt-5") && normalized.contains("-codex") {
        return Some("low");
    }
    if normalized.starts_with("gpt-5.6") {
        return Some("none");
    }
    if !normalized.starts_with("gpt-6") {
        return None;
    }
    // Accept dated snapshots of the known models as well as their aliases.
    Some(
        if ["gpt-6.1-terra", "gpt-6-sol", "gpt-6-luna"]
            .iter()
            .any(|name| normalized == *name || normalized.starts_with(&format!("{name}-")))
        {
            "none"
        } else {
            "low"
        },
    )
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

pub(super) fn take_responses_stream_text(
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
