use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, Instant},
};

use reqwest::Client;
use tokio::sync::Notify;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest, CompletionResult},
    prompt::PromptManager,
    providers::{default_api_url, default_model, get_provider},
};

const COMPLETION_CACHE_MAX_ENTRIES: usize = 128;
const COMPLETION_CACHE_TTL: Duration = Duration::from_secs(15);
const MAX_CACHE_PREFIX_CHARS: usize = 1000;

pub struct AiCompletionService {
    client: Client,
    completion_cache: Mutex<HashMap<CompletionCacheKey, CachedCompletion>>,
    completion_in_flight: Mutex<HashMap<CompletionCacheKey, Arc<InFlightCompletionRequest>>>,
    prompt_manager: PromptManager,
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct CompletionCacheKey {
    api_url: String,
    model: String,
    prefix: String,
    provider: AiProvider,
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
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(8)
            .tcp_keepalive(Duration::from_secs(30))
            .user_agent("madora/1.0")
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            completion_cache: Mutex::new(HashMap::new()),
            completion_in_flight: Mutex::new(HashMap::new()),
            prompt_manager: PromptManager::new(),
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

fn resolve_provider(config: &AiCompletionConfig) -> AiProvider {
    config.provider.unwrap_or(AiProvider::DeepSeek)
}

fn build_completion_cache_key(
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> CompletionCacheKey {
    let provider = resolve_provider(config);

    CompletionCacheKey {
        api_url: resolve_cache_api_url(provider, config),
        model: resolve_cache_model(provider, config),
        prefix: truncate_suffix_for_cache(&request.prefix),
        provider,
        suffix: request.suffix.as_deref().map(|s| truncate_suffix_for_cache(s)),
    }
}

fn truncate_suffix_for_cache(value: &str) -> String {
    let total = value.chars().count();
    let skip = total.saturating_sub(MAX_CACHE_PREFIX_CHARS);
    value.chars().skip(skip).collect()
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

fn resolve_cache_api_url(provider: AiProvider, config: &AiCompletionConfig) -> String {
    let api_url = config
        .api_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| default_api_url(provider))
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_string();

    if provider == AiProvider::DeepSeek && !api_url.is_empty() && !api_url.ends_with("/beta") {
        return format!("{api_url}/beta");
    }

    api_url
}

fn resolve_cache_model(provider: AiProvider, config: &AiCompletionConfig) -> String {
    config
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| default_model(provider))
        .unwrap_or_default()
        .to_string()
}

pub async fn generate_completion(
    service: &AiCompletionService,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<CompletionResult, String> {
    let cache_key = build_completion_cache_key(config, request);

    if let Some(text) = get_cached_completion(service, &cache_key) {
        return Ok(CompletionResult { text });
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
        return Ok(CompletionResult {
            text: wait_for_in_flight_completion_request(&in_flight_request).await?,
        });
    }

    let provider = get_provider(resolve_provider(config));
    let result = provider
        .request_fim_completion(&service.client, &service.prompt_manager, config, request)
        .await;

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

    result.map(|text| CompletionResult { text })
}
