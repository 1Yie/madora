use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, Instant},
};

use reqwest::Client;
use tauri::ipc::Channel;
use tokio::{sync::Notify, time::timeout};
use tokio_util::sync::CancellationToken;

use crate::i18n;

use crate::{
    models::ai::{
        AiCompletionConfig, AiProvider, CompletionRequest, CompletionResult, CustomProviderProtocol,
    },
    prompt::PromptManager,
    providers::{build_prompt_context, default_model, resolve_protocol},
};

const COMPLETION_CACHE_MAX_ENTRIES: usize = 128;
const COMPLETION_CACHE_TTL: Duration = Duration::from_secs(15);
/// Safety valve so a follower can never wait forever if its leader vanishes.
const IN_FLIGHT_WAIT_TIMEOUT: Duration = Duration::from_secs(60);
/// Initial attempt plus this many re-acquisitions as the new leader.
const MAX_LEADER_ATTEMPTS: usize = 3;
/// Minimum overlap before a repeated prefix is stripped from a completion.
const MIN_DUPLICATED_PREFIX_CHARS: usize = 8;

pub struct AiCompletionService {
    client: Client,
    completion_cache: Mutex<HashMap<CompletionCacheKey, CachedCompletion>>,
    in_flight: InFlightRegistry,
    cancellations: CancellationRegistry,
    prompt_manager: PromptManager,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct CompletionCacheKey {
    api_url: String,
    custom_protocol: Option<CustomProviderProtocol>,
    model: String,
    provider: AiProvider,
    use_ssl: bool,
    /// Fingerprints of the text sent upstream rather than the text itself.
    /// The cache only needs to tell two requests apart, so this keeps the key
    /// small and cheap to hash on every keystroke, and does not hold a second
    /// copy of the user's document in memory.
    title: u64,
    prefix: u64,
    suffix: u64,
    template_revision: u64,
}

/// A stable hash of one piece of a completion request.
fn fingerprint(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

#[derive(Clone)]
struct CachedCompletion {
    expires_at: Instant,
    last_accessed_at: Instant,
    text: String,
}

#[derive(Clone)]
enum SharedCompletionOutcome {
    Completed(Result<String, String>),
    Cancelled,
}

struct InFlightCompletionRequest {
    notify: Notify,
    outcome: Mutex<Option<SharedCompletionOutcome>>,
}

impl InFlightCompletionRequest {
    fn new() -> Self {
        Self {
            notify: Notify::new(),
            outcome: Mutex::new(None),
        }
    }

    fn set_outcome(&self, outcome: SharedCompletionOutcome) {
        {
            let mut slot = lock_unpoisoned(&self.outcome);
            *slot = Some(outcome);
        }
        self.notify.notify_waiters();
    }

    fn outcome(&self) -> Option<SharedCompletionOutcome> {
        lock_unpoisoned(&self.outcome).clone()
    }
}

/// RAII owner of an in-flight entry. If the leader future is dropped or panics
/// before publishing a result, `Drop` records a cancellation outcome, wakes
/// waiters, and removes the entry so no follower can hang on a dead leader.
struct InFlightLeaderGuard {
    registry: InFlightRegistry,
    cache_key: CompletionCacheKey,
    request: Arc<InFlightCompletionRequest>,
}

impl Drop for InFlightLeaderGuard {
    fn drop(&mut self) {
        {
            let mut slot = lock_unpoisoned(&self.request.outcome);
            if slot.is_none() {
                *slot = Some(SharedCompletionOutcome::Cancelled);
            }
        }

        // Remove before notifying: a woken waiter must observe the empty slot
        // and re-acquire as the new leader instead of latching onto a dead one.
        self.registry.remove_if_same(&self.cache_key, &self.request);
        self.request.notify.notify_waiters();
    }
}

#[derive(Clone)]
struct InFlightRegistry {
    entries: Arc<Mutex<HashMap<CompletionCacheKey, Arc<InFlightCompletionRequest>>>>,
}

impl InFlightRegistry {
    fn new() -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn acquire(&self, key: &CompletionCacheKey) -> (Arc<InFlightCompletionRequest>, bool) {
        let mut entries = lock_unpoisoned(&self.entries);

        if let Some(existing) = entries.get(key) {
            return (existing.clone(), false);
        }

        let request = Arc::new(InFlightCompletionRequest::new());
        entries.insert(key.clone(), request.clone());
        (request, true)
    }

    fn remove_if_same(&self, key: &CompletionCacheKey, request: &Arc<InFlightCompletionRequest>) {
        let mut entries = lock_unpoisoned(&self.entries);

        if entries
            .get(key)
            .is_some_and(|existing| Arc::ptr_eq(existing, request))
        {
            entries.remove(key);
        }
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        lock_unpoisoned(&self.entries).len()
    }
}

#[derive(Clone)]
struct CancellationRegistry {
    tokens: Arc<Mutex<HashMap<String, Arc<CancellationToken>>>>,
}

impl CancellationRegistry {
    fn new() -> Self {
        Self {
            tokens: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn register(&self, request_id: &str) -> CancellationGuard {
        let token = Arc::new(CancellationToken::new());
        lock_unpoisoned(&self.tokens).insert(request_id.to_string(), token.clone());

        CancellationGuard {
            tokens: self.tokens.clone(),
            request_id: request_id.to_string(),
            token,
        }
    }

    fn cancel(&self, request_id: &str) {
        let token = lock_unpoisoned(&self.tokens).get(request_id).cloned();

        if let Some(token) = token {
            token.cancel();
        }
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        lock_unpoisoned(&self.tokens).len()
    }
}

/// Removes the request's cancellation token when the request finishes so the
/// map cannot grow unbounded.
struct CancellationGuard {
    tokens: Arc<Mutex<HashMap<String, Arc<CancellationToken>>>>,
    request_id: String,
    token: Arc<CancellationToken>,
}

impl CancellationGuard {
    fn token(&self) -> CancellationToken {
        (*self.token).clone()
    }
}

impl Drop for CancellationGuard {
    fn drop(&mut self) {
        let mut tokens = lock_unpoisoned(&self.tokens);

        if tokens
            .get(&self.request_id)
            .is_some_and(|existing| Arc::ptr_eq(existing, &self.token))
        {
            tokens.remove(&self.request_id);
        }
    }
}

enum WaiterOutcome {
    Completed(Result<String, String>),
    /// The leader disappeared; the waiter should retry as the new leader.
    Cancelled,
    /// This waiter's own request was cancelled by the user.
    CancelledByUser,
    TimedOut,
}

impl Default for AiCompletionService {
    fn default() -> Self {
        Self::new()
    }
}

impl AiCompletionService {
    pub fn new() -> Self {
        let client = Self::build_client();

        Self {
            client,
            completion_cache: Mutex::new(HashMap::new()),
            in_flight: InFlightRegistry::new(),
            cancellations: CancellationRegistry::new(),
            prompt_manager: PromptManager::new(),
        }
    }

    /// Cancels the streaming completion registered under `request_id`, if any.
    pub fn cancel_completion_stream(&self, request_id: &str) {
        self.cancellations.cancel(request_id);
    }

    /// The tuned client, or reqwest's default one.
    ///
    /// A build failure here would otherwise take the whole application down at
    /// startup; losing the connection-tuning settings is a far smaller problem
    /// than losing the app, and completions still work.
    fn build_client() -> Client {
        Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(8)
            .tcp_keepalive(Duration::from_secs(30))
            .user_agent("madora/1.0")
            .build()
            .unwrap_or_else(|error| {
                eprintln!("could not build the tuned HTTP client ({error}); using defaults");
                Client::new()
            })
    }
}

pub(crate) fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
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

/// Builds the cache key from exactly the text every provider sends: the
/// request run through the shared `build_prompt_context` truncation. Because
/// no provider bypasses it, the key cannot drift from the actual input.
fn resolve_cache_prompt_fields(request: &CompletionRequest) -> (String, String) {
    let context = build_prompt_context(request);
    (context.prefix, context.suffix)
}

fn build_completion_cache_key(
    service: &AiCompletionService,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> CompletionCacheKey {
    let provider = resolve_provider(config);
    let (prefix, suffix) = resolve_cache_prompt_fields(request);

    CompletionCacheKey {
        api_url: resolve_cache_api_url(provider, config),
        custom_protocol: resolve_cache_custom_protocol(provider, config),
        model: resolve_cache_model(provider, config),
        provider,
        use_ssl: config.use_ssl,
        title: fingerprint(request.title.as_deref().unwrap_or("Untitled")),
        prefix: fingerprint(&prefix),
        suffix: fingerprint(&suffix),
        template_revision: service.prompt_manager.revision(),
    }
}

fn resolve_cache_custom_protocol(
    provider: AiProvider,
    config: &AiCompletionConfig,
) -> Option<CustomProviderProtocol> {
    if provider == AiProvider::Custom {
        return Some(config.custom_protocol.unwrap_or_default());
    }

    None
}

async fn await_shared_outcome(request: &Arc<InFlightCompletionRequest>) -> SharedCompletionOutcome {
    loop {
        let notified = request.notify.notified();
        tokio::pin!(notified);
        // Register the waiter before checking so a concurrent `notify_waiters`
        // cannot be missed between the check and the await.
        notified.as_mut().enable();

        if let Some(outcome) = request.outcome() {
            return outcome;
        }

        notified.await;
    }
}

async fn wait_for_in_flight_completion_request(
    request: &Arc<InFlightCompletionRequest>,
    token: Option<&CancellationToken>,
) -> WaiterOutcome {
    let wait = async {
        match timeout(IN_FLIGHT_WAIT_TIMEOUT, await_shared_outcome(request)).await {
            Ok(SharedCompletionOutcome::Completed(result)) => WaiterOutcome::Completed(result),
            Ok(SharedCompletionOutcome::Cancelled) => WaiterOutcome::Cancelled,
            Err(_) => WaiterOutcome::TimedOut,
        }
    };

    match token {
        Some(token) => tokio::select! {
            biased;
            _ = token.cancelled() => WaiterOutcome::CancelledByUser,
            outcome = wait => outcome,
        },
        None => wait.await,
    }
}

fn in_flight_timeout_error() -> String {
    "completion request timed out while waiting for an in-flight result".to_string()
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

fn send_completion_chunk(channel: &Channel<String>, chunk: String) -> Result<(), String> {
    if chunk.is_empty() {
        return Ok(());
    }

    channel
        .send(chunk)
        .map_err(|error| i18n::tf("ai.send_chunk_failed", &[("error", &error.to_string())]))
}

/// Applies conservative cleanup to a completion before it is returned or
/// cached: unwrap a single outer code fence, drop an opening that merely
/// repeats the end of the prefix, and treat blank output as empty.
fn postprocess_completion(text: &str, prefix: &str) -> String {
    if text.trim().is_empty() {
        return String::new();
    }

    let without_fence = strip_wrapping_code_fence(text);
    let deduplicated = strip_duplicated_prefix(&without_fence, prefix);

    if deduplicated.trim().is_empty() {
        String::new()
    } else {
        deduplicated
    }
}

fn strip_wrapping_code_fence(text: &str) -> String {
    let trimmed = text.trim();

    let Some(first_line) = trimmed.lines().next() else {
        return text.to_string();
    };

    if !first_line.trim_start().starts_with("```") {
        return text.to_string();
    }

    let Some(last_line) = trimmed.lines().last() else {
        return text.to_string();
    };

    if last_line.trim() != "```" {
        return text.to_string();
    }

    let Some(first_newline) = trimmed.find('\n') else {
        return text.to_string();
    };

    let Some(closing_index) = trimmed.rfind("```") else {
        return text.to_string();
    };

    if closing_index <= first_newline {
        return text.to_string();
    }

    trimmed[first_newline + 1..closing_index]
        .trim_end_matches(['\n', '\r'])
        .to_string()
}

fn strip_duplicated_prefix(text: &str, prefix: &str) -> String {
    let prefix_chars: Vec<char> = prefix.chars().collect();
    let text_chars: Vec<char> = text.chars().collect();
    let max_overlap = prefix_chars.len().min(text_chars.len());

    if max_overlap < MIN_DUPLICATED_PREFIX_CHARS {
        return text.to_string();
    }

    // Longest first, so the common cases (no overlap at all, or a short one)
    // stop after a couple of comparisons instead of scanning every length.
    for candidate in (MIN_DUPLICATED_PREFIX_CHARS..=max_overlap).rev() {
        let tail = &prefix_chars[prefix_chars.len() - candidate..];

        if tail == &text_chars[..candidate] {
            return text_chars[candidate..].iter().collect();
        }
    }

    text.to_string()
}

/// The endpoint the request will use, resolved by the same helper the
/// providers use so the key cannot describe a different URL than the request.
/// An unresolvable configuration yields an empty key component: such a request
/// fails before anything could be cached.
fn resolve_cache_api_url(provider: AiProvider, config: &AiCompletionConfig) -> String {
    crate::providers::resolve_endpoint(provider, config).unwrap_or_default()
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

fn finalize_completion(
    service: &AiCompletionService,
    cache_key: &CompletionCacheKey,
    result: Result<String, String>,
    prefix: &str,
) -> Result<String, String> {
    let text = result?;
    let text = postprocess_completion(&text, prefix);

    // Never cache an empty completion: it would suppress a real retry within
    // the TTL window after a transient upstream hiccup.
    if !text.is_empty() {
        cache_completion(service, cache_key.clone(), text.clone());
    }

    Ok(text)
}

/// How a completion request ended, from the caller's point of view.
#[derive(Debug, PartialEq)]
enum CompletionOutcome {
    /// Final, post-processed text. Empty means "nothing worth showing".
    Text(String),
    /// The user cancelled; there is nothing to show and nothing to report.
    Cancelled,
}

/// The shared leader/follower protocol behind both completion entry points.
///
/// A cache hit is returned at once. Otherwise the first caller for a cache key
/// becomes the leader and runs `execute`; concurrent callers with the same key
/// wait for the leader's published outcome instead of hitting the provider
/// again. If a leader disappears (dropped or panicked), waiters retry as the
/// new leader, up to `MAX_LEADER_ATTEMPTS` times.
///
/// `execute` produces the raw provider text. It is post-processed, cached and
/// published here, so every caller of a key sees the same final text however
/// it was delivered (streamed or not).
async fn run_completion<E, Fut>(
    service: &AiCompletionService,
    cache_key: &CompletionCacheKey,
    prefix: &str,
    token: Option<&CancellationToken>,
    mut execute: E,
) -> Result<CompletionOutcome, String>
where
    E: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<String, String>>,
{
    if let Some(text) = get_cached_completion(service, cache_key) {
        return Ok(CompletionOutcome::Text(text));
    }

    for _ in 0..MAX_LEADER_ATTEMPTS {
        let (in_flight_request, is_leader) = service.in_flight.acquire(cache_key);

        if !is_leader {
            match wait_for_in_flight_completion_request(&in_flight_request, token).await {
                WaiterOutcome::Completed(result) => return result.map(CompletionOutcome::Text),
                WaiterOutcome::Cancelled => continue,
                WaiterOutcome::CancelledByUser => return Ok(CompletionOutcome::Cancelled),
                WaiterOutcome::TimedOut => return Err(in_flight_timeout_error()),
            }
        }

        let _guard = InFlightLeaderGuard {
            registry: service.in_flight.clone(),
            cache_key: cache_key.clone(),
            request: in_flight_request.clone(),
        };

        // Cancellation drops the provider future, which drops the underlying
        // response stream and closes the connection.
        let raw_result = match token {
            Some(token) => tokio::select! {
                biased;
                _ = token.cancelled() => return Ok(CompletionOutcome::Cancelled),
                result = execute() => result,
            },
            None => execute().await,
        };

        let result = finalize_completion(service, cache_key, raw_result, prefix);
        in_flight_request.set_outcome(SharedCompletionOutcome::Completed(result.clone()));

        return result.map(CompletionOutcome::Text);
    }

    Err(in_flight_timeout_error())
}

pub async fn generate_completion(
    service: &AiCompletionService,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
) -> Result<CompletionResult, String> {
    let cache_key = build_completion_cache_key(service, config, request);
    let provider = resolve_provider(config);

    let outcome = run_completion(service, &cache_key, &request.prefix, None, || async {
        resolve_protocol(provider, config)?
            .complete(&service.client, &service.prompt_manager, config, request)
            .await
    })
    .await?;

    Ok(CompletionResult {
        text: match outcome {
            CompletionOutcome::Text(text) => text,
            CompletionOutcome::Cancelled => String::new(),
        },
    })
}

/// Streams a completion to `channel` chunk by chunk and returns the final,
/// post-processed text.
///
/// The chunks are the provider's raw output as it arrives; the returned text
/// is what gets cached and handed to every other caller of the same request,
/// so the frontend should show it in place of what it accumulated. `None`
/// means the request was cancelled.
pub async fn generate_completion_stream(
    service: &AiCompletionService,
    config: &AiCompletionConfig,
    request: &CompletionRequest,
    request_id: Option<String>,
    channel: Channel<String>,
) -> Result<Option<String>, String> {
    let _cancellation_guard = request_id
        .as_deref()
        .map(|request_id| service.cancellations.register(request_id));
    let token = _cancellation_guard.as_ref().map(CancellationGuard::token);

    let cache_key = build_completion_cache_key(service, config, request);
    let provider = resolve_provider(config);

    // Only a leader streams. Cached and followed results arrive whole, as a
    // single chunk, before the final text is returned.
    let streamed = std::sync::atomic::AtomicBool::new(false);

    let outcome = run_completion(service, &cache_key, &request.prefix, token.as_ref(), || {
        streamed.store(true, std::sync::atomic::Ordering::SeqCst);
        let channel = &channel;
        async move {
            let mut on_chunk = |chunk: String| send_completion_chunk(channel, chunk);
            resolve_protocol(provider, config)?
                .complete_stream(
                    &service.client,
                    &service.prompt_manager,
                    config,
                    request,
                    &mut on_chunk,
                )
                .await
        }
    })
    .await?;

    match outcome {
        CompletionOutcome::Cancelled => Ok(None),
        CompletionOutcome::Text(text) => {
            if !streamed.load(std::sync::atomic::Ordering::SeqCst) {
                send_completion_chunk(&channel, text.clone())?;
            }

            Ok(Some(text))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::{AiCompletionConfig, AiProvider, CompletionRequest};
    use crate::providers::{MAX_CHAT_PREFIX_CHARS, MAX_CHAT_SUFFIX_CHARS};

    fn test_cache_key(label: &str) -> CompletionCacheKey {
        CompletionCacheKey {
            api_url: "https://api.example.com".to_string(),
            custom_protocol: None,
            model: label.to_string(),
            provider: AiProvider::OpenAi,
            use_ssl: true,
            title: fingerprint("Doc"),
            prefix: fingerprint("prefix"),
            suffix: fingerprint(""),
            template_revision: 0,
        }
    }

    fn test_service() -> AiCompletionService {
        AiCompletionService::new()
    }

    fn openai_config() -> AiCompletionConfig {
        AiCompletionConfig {
            provider: Some(AiProvider::OpenAi),
            ..Default::default()
        }
    }

    // ─── resolve_cache_api_url ───────────────────────────────────────

    #[test]
    fn resolve_cache_api_url_deepseek_adds_beta() {
        let config = AiCompletionConfig::default();
        let url = resolve_cache_api_url(AiProvider::DeepSeek, &config);
        assert!(url.ends_with("/beta"));
    }

    #[test]
    fn resolve_cache_api_url_openai_no_beta() {
        let config = AiCompletionConfig::default();
        let url = resolve_cache_api_url(AiProvider::OpenAi, &config);
        assert_eq!(url, "https://api.openai.com");
    }

    #[test]
    fn resolve_cache_api_url_custom_url() {
        let mut config = AiCompletionConfig::default();
        config.api_url = Some("https://custom.api.com".into());
        let url = resolve_cache_api_url(AiProvider::DeepSeek, &config);
        assert!(url.contains("custom.api.com"));
        assert!(url.ends_with("/beta"));
    }

    #[test]
    fn resolve_cache_api_url_already_has_beta() {
        let mut config = AiCompletionConfig::default();
        config.api_url = Some("https://api.deepseek.com/beta".into());
        let url = resolve_cache_api_url(AiProvider::DeepSeek, &config);
        assert_eq!(url, "https://api.deepseek.com/beta");
    }

    // ─── resolve_cache_model ─────────────────────────────────────────

    #[test]
    fn resolve_cache_model_configured() {
        let mut config = AiCompletionConfig::default();
        config.model = Some("my-model".into());
        let model = resolve_cache_model(AiProvider::DeepSeek, &config);
        assert_eq!(model, "my-model");
    }

    #[test]
    fn resolve_cache_model_default_deepseek() {
        let config = AiCompletionConfig::default();
        let model = resolve_cache_model(AiProvider::DeepSeek, &config);
        assert_eq!(model, "deepseek-v4-pro");
    }

    #[test]
    fn resolve_cache_model_custom_no_default() {
        let config = AiCompletionConfig::default();
        let model = resolve_cache_model(AiProvider::Custom, &config);
        assert_eq!(model, "");
    }

    // ─── build_completion_cache_key ──────────────────────────────────

    #[test]
    fn build_completion_cache_key_basic() {
        let service = test_service();
        let config = AiCompletionConfig::default();
        let request = CompletionRequest {
            title: None,
            prefix: "hello".into(),
            suffix: None,
        };
        let key = build_completion_cache_key(&service, &config, &request);
        assert_eq!(key.provider, AiProvider::DeepSeek);
        // The key holds fingerprints, never the text itself.
        assert_eq!(key.prefix, fingerprint("hello"));
        assert_eq!(key.suffix, fingerprint(""));
        assert_eq!(key.title, fingerprint("Untitled"));
        assert_ne!(key.prefix, fingerprint("hello "));
    }

    #[test]
    fn cache_key_includes_title_and_use_ssl() {
        let service = test_service();
        let request = CompletionRequest {
            title: Some("Doc A".into()),
            prefix: "p".into(),
            suffix: Some("tail".into()),
        };
        let titled_request = CompletionRequest {
            title: Some("Doc B".into()),
            prefix: "p".into(),
            suffix: Some("tail".into()),
        };

        let insecure_config = AiCompletionConfig {
            provider: Some(AiProvider::OpenAi),
            use_ssl: false,
            ..Default::default()
        };
        let secure_config = AiCompletionConfig {
            provider: Some(AiProvider::OpenAi),
            use_ssl: true,
            ..Default::default()
        };

        let base = build_completion_cache_key(&service, &insecure_config, &request);
        let titled = build_completion_cache_key(&service, &insecure_config, &titled_request);
        let secure = build_completion_cache_key(&service, &secure_config, &request);

        assert_ne!(base, titled, "title must affect the cache key");
        assert_ne!(base, secure, "use_ssl must affect the cache key");
    }

    #[test]
    fn cache_key_ignores_suffix_beyond_the_sent_prefix_of_the_suffix() {
        let service = test_service();
        let config = openai_config();
        let head = "a".repeat(MAX_CHAT_SUFFIX_CHARS);
        let request_a = CompletionRequest {
            title: None,
            prefix: "p".into(),
            suffix: Some(format!("{head}tail-a")),
        };
        let request_b = CompletionRequest {
            title: None,
            prefix: "p".into(),
            suffix: Some(format!("{head}tail-b")),
        };

        assert_eq!(
            build_completion_cache_key(&service, &config, &request_a),
            build_completion_cache_key(&service, &config, &request_b)
        );
    }

    #[test]
    fn cache_key_ignores_prefix_before_the_sent_suffix_of_the_prefix() {
        let service = test_service();
        let config = openai_config();
        let tail = "b".repeat(MAX_CHAT_PREFIX_CHARS);
        let request_a = CompletionRequest {
            title: None,
            prefix: format!("head-a{tail}"),
            suffix: None,
        };
        let request_b = CompletionRequest {
            title: None,
            prefix: format!("head-b{tail}"),
            suffix: None,
        };

        assert_eq!(
            build_completion_cache_key(&service, &config, &request_a),
            build_completion_cache_key(&service, &config, &request_b)
        );
    }

    #[test]
    fn cache_key_distinguishes_providers() {
        let service = test_service();
        let request = CompletionRequest {
            title: None,
            prefix: "p".into(),
            suffix: None,
        };
        let openai = AiCompletionConfig {
            provider: Some(AiProvider::OpenAi),
            ..Default::default()
        };
        let google = AiCompletionConfig {
            provider: Some(AiProvider::Google),
            ..Default::default()
        };

        assert_ne!(
            build_completion_cache_key(&service, &openai, &request),
            build_completion_cache_key(&service, &google, &request)
        );
    }

    // ─── resolve_provider ────────────────────────────────────────────

    #[test]
    fn resolve_provider_default() {
        let config = AiCompletionConfig::default();
        assert_eq!(resolve_provider(&config), AiProvider::DeepSeek);
    }

    #[test]
    fn resolve_provider_explicit() {
        let mut config = AiCompletionConfig::default();
        config.provider = Some(AiProvider::OpenAi);
        assert_eq!(resolve_provider(&config), AiProvider::OpenAi);
    }

    // ─── postprocess_completion ──────────────────────────────────────

    #[test]
    fn postprocess_leaves_normal_completions_untouched() {
        assert_eq!(
            postprocess_completion("const x = 1;", "let y = 2;\n"),
            "const x = 1;"
        );
    }

    #[test]
    fn postprocess_unwraps_a_single_code_fence() {
        assert_eq!(
            postprocess_completion("```rust\nlet x = 1;\n```", ""),
            "let x = 1;"
        );
        assert_eq!(postprocess_completion("```\nplain\n```", ""), "plain");
    }

    #[test]
    fn postprocess_keeps_partial_or_multi_fences() {
        assert_eq!(
            postprocess_completion("```rust\nlet x = 1;", ""),
            "```rust\nlet x = 1;"
        );
        assert_eq!(
            postprocess_completion("```\na\n```\ntrailing", ""),
            "```\na\n```\ntrailing"
        );
    }

    #[test]
    fn postprocess_strips_a_long_repeated_prefix() {
        let prefix = "line one\nline two\n";
        assert_eq!(
            postprocess_completion("line two\nline three", prefix),
            "line three"
        );
    }

    #[test]
    fn postprocess_strips_the_longest_repeat_when_several_lengths_match() {
        // The prefix tail is periodic, so 8, 10 and 12 characters all match;
        // the whole 12 must be removed, not just the shortest match.
        assert_eq!(postprocess_completion("abababababab", "xxabababababab"), "");
        assert_eq!(
            postprocess_completion("ababababababXY", "xxabababababab"),
            "XY"
        );
    }

    #[test]
    fn postprocess_keeps_short_or_unrelated_overlaps() {
        // Overlap shorter than the 8-character guard must be preserved.
        assert_eq!(postprocess_completion("tail", "the tail"), "tail");
        assert_eq!(
            postprocess_completion("unrelated", "prefix text"),
            "unrelated"
        );
    }

    #[test]
    fn postprocess_treats_blank_output_as_empty() {
        assert_eq!(postprocess_completion("   \n\t ", "prefix"), "");
        assert_eq!(postprocess_completion("```\n   \n```", ""), "");
    }

    // ─── InFlightRegistry ────────────────────────────────────────────

    #[test]
    fn in_flight_registry_dedupes_by_key() {
        let registry = InFlightRegistry::new();
        let key = test_cache_key("dedupe");

        let (leader, is_leader) = registry.acquire(&key);
        assert!(is_leader);

        let (follower, is_follower_leader) = registry.acquire(&key);
        assert!(!is_follower_leader);
        assert!(Arc::ptr_eq(&leader, &follower));
        assert_eq!(registry.len(), 1);
    }

    #[tokio::test]
    async fn dropping_leader_wakes_waiters_as_cancelled() {
        let registry = InFlightRegistry::new();
        let key = test_cache_key("drop");
        let (request, is_leader) = registry.acquire(&key);
        assert!(is_leader);

        let waiter_request = request.clone();
        let waiter = tokio::spawn(async move {
            wait_for_in_flight_completion_request(&waiter_request, None).await
        });

        // Let the waiter register on the notify future.
        tokio::task::yield_now().await;

        let guard = InFlightLeaderGuard {
            registry: registry.clone(),
            cache_key: key.clone(),
            request: request.clone(),
        };
        drop(guard);

        let outcome = waiter.await.unwrap();
        assert!(matches!(outcome, WaiterOutcome::Cancelled));
        assert_eq!(registry.len(), 0);
    }

    #[tokio::test]
    async fn leader_panic_cleans_up_the_registry_entry() {
        let registry = InFlightRegistry::new();
        let key = test_cache_key("panic");

        let (request, is_leader) = registry.acquire(&key);
        assert!(is_leader);

        let task_registry = registry.clone();
        let task_key = key.clone();
        let task_request = request.clone();
        let handle = tokio::spawn(async move {
            let _guard = InFlightLeaderGuard {
                registry: task_registry,
                cache_key: task_key,
                request: task_request,
            };
            panic!("simulated leader panic");
        });

        assert!(handle.await.is_err());
        assert_eq!(registry.len(), 0);
        assert!(matches!(
            request.outcome(),
            Some(SharedCompletionOutcome::Cancelled)
        ));
    }

    #[tokio::test]
    async fn follower_retries_after_a_cancelled_leader() {
        let registry = InFlightRegistry::new();
        let key = test_cache_key("retry");

        let (leader, _) = registry.acquire(&key);
        let guard = InFlightLeaderGuard {
            registry: registry.clone(),
            cache_key: key.clone(),
            request: leader.clone(),
        };
        drop(guard);

        let (new_leader, is_leader) = registry.acquire(&key);
        assert!(is_leader);
        assert!(!Arc::ptr_eq(&leader, &new_leader));
        assert_eq!(registry.len(), 1);
    }

    // ─── CancellationRegistry ────────────────────────────────────────

    #[test]
    fn cancellation_registry_cancels_and_cleans_up() {
        let registry = CancellationRegistry::new();
        let guard = registry.register("req-1");
        let token = guard.token();
        assert!(!token.is_cancelled());

        registry.cancel("req-1");
        assert!(token.is_cancelled());
        assert_eq!(registry.len(), 1);

        drop(guard);
        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn cancelling_an_unknown_request_is_a_noop() {
        let registry = CancellationRegistry::new();
        registry.cancel("missing");
        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn service_cancel_completion_stream_cancels_the_registered_token() {
        let service = test_service();
        let guard = service.cancellations.register("req-42");
        let token = guard.token();

        service.cancel_completion_stream("req-42");

        assert!(token.is_cancelled());
    }

    fn deepseek_config() -> AiCompletionConfig {
        AiCompletionConfig {
            provider: Some(AiProvider::DeepSeek),
            ..openai_config()
        }
    }

    #[test]
    fn deepseek_cache_key_ignores_text_beyond_what_is_sent() {
        let service = test_service();
        let config = deepseek_config();
        let head = "a".repeat(MAX_CHAT_SUFFIX_CHARS);
        let tail = "b".repeat(MAX_CHAT_PREFIX_CHARS);
        let request = |prefix_head: &str, suffix_tail: &str| CompletionRequest {
            title: None,
            prefix: format!("{prefix_head}{tail}"),
            suffix: Some(format!("{head}{suffix_tail}")),
        };

        assert_eq!(
            build_completion_cache_key(&service, &config, &request("head-a", "tail-a")),
            build_completion_cache_key(&service, &config, &request("head-b", "tail-b")),
            "text that is never sent upstream must not split the cache"
        );
    }

    #[test]
    fn every_provider_derives_its_cache_key_text_from_the_same_context() {
        let service = test_service();
        let request = CompletionRequest {
            title: Some("Doc".into()),
            prefix: "p".repeat(MAX_CHAT_PREFIX_CHARS + 500),
            suffix: Some("s".repeat(MAX_CHAT_SUFFIX_CHARS + 500)),
        };
        let context = crate::providers::build_prompt_context(&request);

        for provider in [
            AiProvider::DeepSeek,
            AiProvider::OpenAi,
            AiProvider::Anthropic,
            AiProvider::Google,
            AiProvider::Custom,
        ] {
            let config = AiCompletionConfig {
                provider: Some(provider),
                ..openai_config()
            };
            let key = build_completion_cache_key(&service, &config, &request);

            assert_eq!(key.prefix, fingerprint(&context.prefix), "{provider:?}");
            assert_eq!(key.suffix, fingerprint(&context.suffix), "{provider:?}");
        }
    }

    // ─── run_completion (leader / follower protocol) ─────────────────

    use std::sync::atomic::{AtomicUsize, Ordering};

    async fn run(
        service: &AiCompletionService,
        key: &CompletionCacheKey,
        prefix: &str,
        token: Option<&CancellationToken>,
        calls: &AtomicUsize,
        result: Result<String, String>,
    ) -> Result<CompletionOutcome, String> {
        run_completion(service, key, prefix, token, || {
            calls.fetch_add(1, Ordering::SeqCst);
            let result = result.clone();
            async move { result }
        })
        .await
    }

    #[tokio::test]
    async fn run_completion_postprocesses_caches_and_serves_repeats_from_cache() {
        let service = test_service();
        let key = test_cache_key("run-cache");
        let calls = AtomicUsize::new(0);

        let first = run(
            &service,
            &key,
            "",
            None,
            &calls,
            Ok("```\nfinal text\n```".into()),
        )
        .await;
        let second = run(&service, &key, "", None, &calls, Ok("ignored".into())).await;

        assert_eq!(first, Ok(CompletionOutcome::Text("final text".into())));
        assert_eq!(second, Ok(CompletionOutcome::Text("final text".into())));
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "second call must hit the cache"
        );
        assert_eq!(service.in_flight.len(), 0);
    }

    #[tokio::test]
    async fn run_completion_does_not_cache_empty_or_failed_results() {
        let service = test_service();
        let key = test_cache_key("run-empty");
        let calls = AtomicUsize::new(0);

        let blank = run(&service, &key, "", None, &calls, Ok("  \n".into())).await;
        let failed = run(&service, &key, "", None, &calls, Err("boom".into())).await;
        let good = run(&service, &key, "", None, &calls, Ok("real".into())).await;

        assert_eq!(blank, Ok(CompletionOutcome::Text(String::new())));
        assert_eq!(failed, Err("boom".to_string()));
        assert_eq!(good, Ok(CompletionOutcome::Text("real".into())));
        assert_eq!(
            calls.load(Ordering::SeqCst),
            3,
            "nothing may be cached before `good`"
        );
    }

    #[tokio::test]
    async fn run_completion_strips_a_prefix_the_model_repeated() {
        let service = test_service();
        let key = test_cache_key("run-dup");
        let calls = AtomicUsize::new(0);

        let outcome = run(
            &service,
            &key,
            "the quick brown fox ",
            None,
            &calls,
            Ok("the quick brown fox jumps".into()),
        )
        .await;

        assert_eq!(outcome, Ok(CompletionOutcome::Text("jumps".into())));
    }

    #[tokio::test]
    async fn concurrent_callers_share_one_provider_call_and_one_final_text() {
        let service = std::sync::Arc::new(test_service());
        let key = test_cache_key("run-shared");
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let gate = std::sync::Arc::new(tokio::sync::Notify::new());

        let leader = {
            let (service, key, calls, gate) =
                (service.clone(), key.clone(), calls.clone(), gate.clone());
            tokio::spawn(async move {
                run_completion(&service, &key, "", None, || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    let gate = gate.clone();
                    async move {
                        gate.notified().await;
                        Ok("```\nshared\n```".to_string())
                    }
                })
                .await
            })
        };
        // Let the leader register before the follower arrives.
        while service.in_flight.len() == 0 {
            tokio::task::yield_now().await;
        }

        let follower = {
            let (service, key, calls) = (service.clone(), key.clone(), calls.clone());
            tokio::spawn(async move {
                run_completion(&service, &key, "", None, || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    async { Ok("follower must not run".to_string()) }
                })
                .await
            })
        };
        tokio::task::yield_now().await;
        gate.notify_one();

        let leader = leader.await.unwrap();
        let follower = follower.await.unwrap();

        assert_eq!(leader, Ok(CompletionOutcome::Text("shared".into())));
        assert_eq!(follower, leader, "the follower sees the same final text");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(service.in_flight.len(), 0);
    }

    #[tokio::test]
    async fn cancelling_the_leader_drops_the_provider_call_and_frees_the_key() {
        let service = test_service();
        let key = test_cache_key("run-cancel");
        let token = CancellationToken::new();
        let dropped = std::sync::Arc::new(AtomicUsize::new(0));

        struct OnDrop(std::sync::Arc<AtomicUsize>);
        impl Drop for OnDrop {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }

        let canceller = {
            let token = token.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(20)).await;
                token.cancel();
            })
        };

        let outcome = run_completion(&service, &key, "", Some(&token), || {
            let marker = OnDrop(dropped.clone());
            async move {
                let _marker = marker;
                std::future::pending::<Result<String, String>>().await
            }
        })
        .await;
        canceller.await.unwrap();

        assert_eq!(outcome, Ok(CompletionOutcome::Cancelled));
        assert_eq!(
            dropped.load(Ordering::SeqCst),
            1,
            "the in-progress provider future must be dropped so its connection closes"
        );
        assert_eq!(service.in_flight.len(), 0);
        assert!(get_cached_completion(&service, &key).is_none());
    }

    #[tokio::test]
    async fn a_cancelled_follower_returns_cancelled_without_touching_the_leader() {
        let service = std::sync::Arc::new(test_service());
        let key = test_cache_key("run-follower-cancel");
        let gate = std::sync::Arc::new(tokio::sync::Notify::new());

        let leader = {
            let (service, key, gate) = (service.clone(), key.clone(), gate.clone());
            tokio::spawn(async move {
                run_completion(&service, &key, "", None, || {
                    let gate = gate.clone();
                    async move {
                        gate.notified().await;
                        Ok("leader text".to_string())
                    }
                })
                .await
            })
        };
        while service.in_flight.len() == 0 {
            tokio::task::yield_now().await;
        }

        let token = CancellationToken::new();
        token.cancel();
        let follower = run_completion(&service, &key, "", Some(&token), || async {
            Ok("never".to_string())
        })
        .await;
        gate.notify_one();

        assert_eq!(follower, Ok(CompletionOutcome::Cancelled));
        assert_eq!(
            leader.await.unwrap(),
            Ok(CompletionOutcome::Text("leader text".into())),
            "cancelling a follower must not affect the leader"
        );
    }
}
