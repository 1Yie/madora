use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, Instant},
};

use reqwest::Client;
use serde_json::json;
use tokio::sync::Notify;

use crate::models::ai::{
    AiCompletionConfig, CompletionMode, CompletionRequest, CompletionResult, CompletionResultMode,
    DeepSeekChatCompletionResponse, DeepSeekTextCompletionResponse,
};

const DEFAULT_API_URL: &str = "https://api.deepseek.com";
const DEFAULT_MODEL: &str = "deepseek-v4-pro";
const COMPLETION_CACHE_MAX_ENTRIES: usize = 128;
const COMPLETION_CACHE_TTL: Duration = Duration::from_secs(15);
const MAX_COMPLETION_TOKENS: usize = 512;
const MAX_CHAT_PREFIX_CHARS: usize = 4_000;
const MAX_CHAT_SUFFIX_CHARS: usize = 1_500;
const STOP_SEQUENCES: &[&str] = &["\n\n\n", "\n# ", "\n## "];
const CHAT_PREFIX_SYSTEM_PROMPT: &str = "You are a professional writer continuing a markdown article. Match the existing voice, tone, and formatting exactly. Maintain any frontmatter, heading hierarchy, list styles, code blocks, or tables present. Output ONLY raw continuation text - no explanations, no meta-commentary, no prefixes like 'Here is the continuation:'. Stop naturally at a paragraph or section boundary.";

pub struct AiCompletionService {
    client: Client,
    completion_cache: Mutex<HashMap<CompletionCacheKey, CachedCompletion>>,
    completion_in_flight: Mutex<HashMap<CompletionCacheKey, Arc<InFlightCompletionRequest>>>,
}

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
enum CompletionCacheKind {
    ChatPrefix,
    Fim,
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct CompletionCacheKey {
    kind: CompletionCacheKind,
    api_url: String,
    model: String,
    prefix: String,
    suffix: Option<String>,
}

#[derive(Clone)]
struct CachedCompletion {
    expires_at: Instant,
    last_accessed_at: Instant,
    text: String,
}

struct InFlightCompletionRequest {
    notify: Notify,
    result: Mutex<Option<Result<String, String>>>,
}

impl AiCompletionService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            completion_cache: Mutex::new(HashMap::new()),
            completion_in_flight: Mutex::new(HashMap::new()),
        }
    }
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn cleanup_completion_cache(cache: &mut HashMap<CompletionCacheKey, CachedCompletion>) {
    let now = Instant::now();

    cache.retain(|_, entry| entry.expires_at > now);

    if cache.len() <= COMPLETION_CACHE_MAX_ENTRIES {
        return;
    }

    let mut keys_by_access_time = cache
        .iter()
        .map(|(key, entry)| (key.clone(), entry.last_accessed_at))
        .collect::<Vec<_>>();

    keys_by_access_time.sort_by_key(|(_, last_accessed_at)| *last_accessed_at);

    for (key, _) in keys_by_access_time
        .into_iter()
        .take(cache.len().saturating_sub(COMPLETION_CACHE_MAX_ENTRIES))
    {
        cache.remove(&key);
    }
}

fn build_completion_cache_key(
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    kind: CompletionCacheKind,
) -> CompletionCacheKey {
    CompletionCacheKey {
        kind,
        api_url: resolve_beta_api_url(config.api_url.as_deref()),
        model: resolve_model(config.model.as_deref()).to_string(),
        prefix: request.prefix.clone(),
        suffix: request.suffix.clone(),
    }
}

async fn wait_for_in_flight_completion_request(
    request: &Arc<InFlightCompletionRequest>,
) -> Result<String, String> {
    loop {
        let notified = request.notify.notified();

        {
            let result = lock_unpoisoned(&request.result);

            if let Some(result) = result.as_ref() {
                return result.clone();
            }
        }

        notified.await;
    }
}

fn get_cached_completion(
    service: &AiCompletionService,
    cache_key: &CompletionCacheKey,
) -> Option<String> {
    let mut cache = lock_unpoisoned(&service.completion_cache);

    cleanup_completion_cache(&mut cache);

    let now = Instant::now();
    let entry = cache.get_mut(cache_key)?;

    entry.last_accessed_at = now;

    Some(entry.text.clone())
}

fn cache_completion(service: &AiCompletionService, cache_key: CompletionCacheKey, text: String) {
    let mut cache = lock_unpoisoned(&service.completion_cache);
    let now = Instant::now();

    cleanup_completion_cache(&mut cache);
    cache.insert(
        cache_key,
        CachedCompletion {
            expires_at: now + COMPLETION_CACHE_TTL,
            last_accessed_at: now,
            text,
        },
    );
    cleanup_completion_cache(&mut cache);
}

async fn request_cached_fim_completion(
    service: &AiCompletionService,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let cache_key = build_completion_cache_key(config, request, CompletionCacheKind::Fim);

    if let Some(text) = get_cached_completion(service, &cache_key) {
        return Ok(text);
    }

    let (in_flight_request, is_leader) = {
        let mut in_flight = lock_unpoisoned(&service.completion_in_flight);

        if let Some(in_flight_request) = in_flight.get(&cache_key) {
            (in_flight_request.clone(), false)
        } else {
            let in_flight_request = Arc::new(InFlightCompletionRequest {
                notify: Notify::new(),
                result: Mutex::new(None),
            });

            in_flight.insert(cache_key.clone(), in_flight_request.clone());

            (in_flight_request, true)
        }
    };

    if !is_leader {
        return wait_for_in_flight_completion_request(&in_flight_request).await;
    }

    let result = request_fim_completion(&service.client, config, request).await;

    if let Ok(text) = result.as_ref() {
        cache_completion(service, cache_key.clone(), text.clone());
    }

    {
        let mut shared_result = lock_unpoisoned(&in_flight_request.result);
        *shared_result = Some(result.clone());
    }

    in_flight_request.notify.notify_waiters();

    let mut in_flight = lock_unpoisoned(&service.completion_in_flight);
    in_flight.remove(&cache_key);

    result
}

async fn request_cached_chat_prefix_completion(
    service: &AiCompletionService,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let cache_key = build_completion_cache_key(config, request, CompletionCacheKind::ChatPrefix);

    if let Some(text) = get_cached_completion(service, &cache_key) {
        return Ok(text);
    }

    let (in_flight_request, is_leader) = {
        let mut in_flight = lock_unpoisoned(&service.completion_in_flight);

        if let Some(in_flight_request) = in_flight.get(&cache_key) {
            (in_flight_request.clone(), false)
        } else {
            let in_flight_request = Arc::new(InFlightCompletionRequest {
                notify: Notify::new(),
                result: Mutex::new(None),
            });

            in_flight.insert(cache_key.clone(), in_flight_request.clone());

            (in_flight_request, true)
        }
    };

    if !is_leader {
        return wait_for_in_flight_completion_request(&in_flight_request).await;
    }

    let result = request_chat_prefix_completion(&service.client, config, request).await;

    if let Ok(text) = result.as_ref() {
        cache_completion(service, cache_key.clone(), text.clone());
    }

    {
        let mut shared_result = lock_unpoisoned(&in_flight_request.result);
        *shared_result = Some(result.clone());
    }

    in_flight_request.notify.notify_waiters();

    let mut in_flight = lock_unpoisoned(&service.completion_in_flight);
    in_flight.remove(&cache_key);

    result
}

fn trim_trailing_slash(url: &str) -> &str {
    url.trim_end_matches('/')
}

fn resolve_api_url(api_url: Option<&str>) -> String {
    let normalized = api_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_API_URL);

    trim_trailing_slash(normalized).to_string()
}

fn resolve_beta_api_url(api_url: Option<&str>) -> String {
    let base_url = resolve_api_url(api_url);

    if base_url.ends_with("/beta") {
        return base_url;
    }

    format!("{base_url}/beta")
}

fn resolve_model(model: Option<&str>) -> &str {
    model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL)
}

fn ensure_api_key(config: &AiCompletionConfig) -> Result<&str, String> {
    let trimmed_api_key = config.api_key.trim();

    if trimmed_api_key.is_empty() {
        return Err("请先在设置中填写 API Key".to_string());
    }

    Ok(trimmed_api_key)
}

fn has_suffix(request: &CompletionRequest) -> bool {
    request
        .suffix
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}

fn build_suffix_hint(suffix: Option<&str>) -> String {
    let trimmed_suffix = suffix.map(str::trim).unwrap_or_default();

    if trimmed_suffix.is_empty() {
        return String::new();
    }

    format!(
        "\n\nThe following text appears AFTER the cursor. Your continuation must connect naturally to it without repeating it:\n\n{trimmed_suffix}\n\nGenerate only the missing content between the cursor and the text above."
    )
}

fn take_last_chars(value: &str, max_chars: usize) -> &str {
    if max_chars == 0 {
        return "";
    }

    let total_chars = value.chars().count();

    if total_chars <= max_chars {
        return value;
    }

    let start_char_index = total_chars - max_chars;
    let start_byte_index = value
        .char_indices()
        .nth(start_char_index)
        .map(|(index, _)| index)
        .unwrap_or(0);

    &value[start_byte_index..]
}

fn take_first_chars(value: &str, max_chars: usize) -> &str {
    if max_chars == 0 {
        return "";
    }

    match value.char_indices().nth(max_chars) {
        Some((index, _)) => &value[..index],
        None => value,
    }
}

async fn request_fim_completion(
    client: &Client,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let api_key = ensure_api_key(config)?;
    let api_url = resolve_beta_api_url(config.api_url.as_deref());
    let response = client
        .post(format!("{api_url}/completions"))
        .bearer_auth(api_key)
        .json(&json!({
            "model": resolve_model(config.model.as_deref()),
            "prompt": request.prefix.as_str(),
            "suffix": request.suffix.as_deref(),
            "max_tokens": MAX_COMPLETION_TOKENS,
            "temperature": 0.3,
            "frequency_penalty": 0.3,
            "presence_penalty": 0.1,
            "stop": STOP_SEQUENCES,
        }))
        .send()
        .await
        .map_err(|error| format!("调用 FIM completion 失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误详情".to_string());

        return Err(format!("FIM completion API error ({status}): {body}"));
    }

    let payload = response
        .json::<DeepSeekTextCompletionResponse>()
        .await
        .map_err(|error| format!("解析 FIM completion 响应失败: {error}"))?;

    Ok(payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.text)
        .unwrap_or_default())
}

async fn request_chat_prefix_completion(
    client: &Client,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<String, String> {
    let api_key = ensure_api_key(config)?;
    let api_url = resolve_beta_api_url(config.api_url.as_deref());
    let title = request.title.as_deref().unwrap_or("Untitled");
    let prefix = take_last_chars(&request.prefix, MAX_CHAT_PREFIX_CHARS);
    let suffix = request
        .suffix
        .as_deref()
        .map(|value| take_first_chars(value, MAX_CHAT_SUFFIX_CHARS));
    let user_content = format!(
        "Title: {title}\n\nRecent context before the cursor:\n{prefix}\n\n⟐ Continue writing from the cursor. Flow naturally into the next sentence. Do not repeat existing content.{}",
        build_suffix_hint(suffix)
    );

    let response = client
        .post(format!("{api_url}/chat/completions"))
        .bearer_auth(api_key)
        .json(&json!({
            "model": resolve_model(config.model.as_deref()),
            "messages": [
                {
                    "role": "system",
                    "content": CHAT_PREFIX_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_content,
                },
                {
                    "role": "assistant",
                    "content": "",
                    "prefix": true,
                }
            ],
            "max_tokens": MAX_COMPLETION_TOKENS,
            "temperature": 0.5,
            "frequency_penalty": 0.3,
            "presence_penalty": 0.2,
            "stop": STOP_SEQUENCES,
        }))
        .send()
        .await
        .map_err(|error| format!("调用 chat-prefix completion 失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误详情".to_string());

        return Err(format!(
            "Chat prefix completion API error ({status}): {body}"
        ));
    }

    let payload = response
        .json::<DeepSeekChatCompletionResponse>()
        .await
        .map_err(|error| format!("解析 chat-prefix 响应失败: {error}"))?;

    Ok(payload
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .unwrap_or_default())
}

pub async fn generate_completion(
    service: &AiCompletionService,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<CompletionResult, String> {
    match request.mode.unwrap_or(CompletionMode::Auto) {
        CompletionMode::Fim => {
            let text = request_cached_fim_completion(service, config, request).await?;

            Ok(CompletionResult {
                mode: CompletionResultMode::Fim,
                text,
            })
        }
        CompletionMode::ChatPrefix => {
            let text = request_cached_chat_prefix_completion(service, config, request).await?;

            Ok(CompletionResult {
                mode: CompletionResultMode::ChatPrefix,
                text,
            })
        }
        CompletionMode::Auto => {
            if config.smart_routing_enabled {
                if has_suffix(request) {
                    let text = request_cached_fim_completion(service, config, request).await?;

                    return Ok(CompletionResult {
                        mode: CompletionResultMode::Fim,
                        text,
                    });
                }

                let text = request_cached_chat_prefix_completion(service, config, request).await?;

                return Ok(CompletionResult {
                    mode: CompletionResultMode::ChatPrefix,
                    text,
                });
            }

            let text = request_cached_fim_completion(service, config, request).await?;

            Ok(CompletionResult {
                mode: CompletionResultMode::Fim,
                text,
            })
        }
    }
}
