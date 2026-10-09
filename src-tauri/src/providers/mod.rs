mod anthropic;
mod common;
mod custom;
mod deepseek;
mod google;
mod openai;
mod opencode_go;
mod opencode_zen;

#[cfg(test)]
pub(crate) mod test_support;

use reqwest::Client;

use crate::{
    models::ai::{AiCompletionConfig, AiProvider, CompletionRequest},
    prompt::PromptManager,
};

pub use common::{
    build_prompt_context, resolve_api_url, resolve_model, MAX_CHAT_PREFIX_CHARS,
    MAX_CHAT_SUFFIX_CHARS,
};

const ANTHROPIC_DEFAULT_API_URL: &str = "https://api.anthropic.com";
const ANTHROPIC_DEFAULT_MODEL: &str = "claude-fable-5-1";
const DEEPSEEK_DEFAULT_API_URL: &str = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-flash";
const GOOGLE_DEFAULT_API_URL: &str = "https://generativelanguage.googleapis.com";
const GOOGLE_DEFAULT_MODEL: &str = "gemini-3.8-flash";
const KIMI_DEFAULT_API_URL: &str = "https://api.moonshot.cn";
const KIMI_DEFAULT_MODEL: &str = "kimi-k3";
const MINIMAX_DEFAULT_API_URL: &str = "https://api.minimaxi.com/anthropic";
const MINIMAX_DEFAULT_MODEL: &str = "MiniMax-M3";
const MINIMAX_CODING_DEFAULT_API_URL: &str = "https://api.minimaxi.com/anthropic";
const MINIMAX_CODING_DEFAULT_MODEL: &str = "MiniMax-M3";
const MIMO_DEFAULT_API_URL: &str = "https://api.xiaomimimo.com";
const MIMO_DEFAULT_MODEL: &str = "mimo-v2.6-pro";
const MIMO_CODING_DEFAULT_API_URL: &str = "https://token-plan-cn.xiaomimimo.com";
const MIMO_CODING_DEFAULT_MODEL: &str = "mimo-v2.6-pro";
const OPENAI_DEFAULT_API_URL: &str = "https://api.openai.com";
const OPENAI_DEFAULT_MODEL: &str = "gpt-6.1-sol";
const OPENCODE_GO_DEFAULT_API_URL: &str = "https://opencode.ai/zen/go";
const OPENCODE_GO_DEFAULT_MODEL: &str = "kimi-k3";
const OPENCODE_ZEN_DEFAULT_API_URL: &str = "https://opencode.ai/zen";
const OPENCODE_ZEN_DEFAULT_MODEL: &str = "claude-fable-5-1";
const ZHIPU_DEFAULT_API_URL: &str = "https://open.bigmodel.cn/api/paas/v4";
const ZHIPU_DEFAULT_MODEL: &str = "glm-5.3";
const ZHIPU_CODING_DEFAULT_API_URL: &str = "https://open.bigmodel.cn/api/coding/paas/v4";
const ZHIPU_CODING_DEFAULT_MODEL: &str = "glm-5.3";

/// How a provider's requests are shaped on the wire.
///
/// A protocol is a request/response format, not a vendor: many providers share
/// one, and a multiplexing provider (Custom, OpenCode) picks one per request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Protocol {
    /// OpenAI-compatible `/v1/chat/completions`.
    OpenAiChat,
    /// Anthropic-compatible `/v1/messages`.
    AnthropicMessages,
    /// Google `:generateContent` / `:streamGenerateContent`.
    GoogleGenerate,
    /// OpenAI Responses `/v1/responses`.
    OpenAiResponses,
    /// DeepSeek's raw fill-in-the-middle `/completions`.
    DeepSeekCompletion,
}

impl Protocol {
    pub async fn complete(
        self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
    ) -> Result<String, String> {
        match self {
            Self::OpenAiChat => {
                openai::request_openai_compatible_fim(client, prompt_manager, config, request).await
            }
            Self::AnthropicMessages => {
                anthropic::request_anthropic_compatible_fim(client, prompt_manager, config, request)
                    .await
            }
            Self::GoogleGenerate => {
                google::request_google_compatible_fim(client, prompt_manager, config, request).await
            }
            Self::OpenAiResponses => {
                opencode_zen::request_openai_responses_fim(client, prompt_manager, config, request)
                    .await
            }
            Self::DeepSeekCompletion => {
                deepseek::request_deepseek_completion(client, prompt_manager, config, request).await
            }
        }
    }

    pub async fn complete_stream(
        self,
        client: &Client,
        prompt_manager: &PromptManager,
        config: &AiCompletionConfig,
        request: &CompletionRequest,
        on_chunk: &mut (dyn FnMut(String) -> Result<(), String> + Send),
    ) -> Result<String, String> {
        match self {
            Self::OpenAiChat => {
                openai::request_openai_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            Self::AnthropicMessages => {
                anthropic::request_anthropic_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            Self::GoogleGenerate => {
                google::request_google_compatible_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            Self::OpenAiResponses => {
                opencode_zen::request_openai_responses_fim_stream(
                    client,
                    prompt_manager,
                    config,
                    request,
                    on_chunk,
                )
                .await
            }
            Self::DeepSeekCompletion => {
                deepseek::request_deepseek_completion_stream(
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

/// One provider: its identity, defaults and protocol.
///
/// This table is the single source of truth. Adding an OpenAI-compatible
/// provider is one row, not a module plus four match arms.
pub struct ProviderSpec {
    key: &'static str,
    pub default_api_url: Option<&'static str>,
    pub default_model: Option<&'static str>,
    pub protocol: Protocol,
    /// Appended to the base URL for APIs that live under a sub-path.
    pub path_affix: Option<&'static str>,
}

const PROVIDERS: &[ProviderSpec] = &[
    ProviderSpec {
        key: "anthropic",
        default_api_url: Some(ANTHROPIC_DEFAULT_API_URL),
        default_model: Some(ANTHROPIC_DEFAULT_MODEL),
        protocol: Protocol::AnthropicMessages,
        path_affix: None,
    },
    ProviderSpec {
        key: "custom",
        default_api_url: None,
        default_model: None,
        // The user chooses the protocol; `resolve_protocol` reads it from the
        // configuration instead of this row.
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "deepseek",
        default_api_url: Some(DEEPSEEK_DEFAULT_API_URL),
        default_model: Some(DEEPSEEK_DEFAULT_MODEL),
        protocol: Protocol::DeepSeekCompletion,
        path_affix: Some("/beta"),
    },
    ProviderSpec {
        key: "google",
        default_api_url: Some(GOOGLE_DEFAULT_API_URL),
        default_model: Some(GOOGLE_DEFAULT_MODEL),
        protocol: Protocol::GoogleGenerate,
        path_affix: None,
    },
    ProviderSpec {
        key: "kimi",
        default_api_url: Some(KIMI_DEFAULT_API_URL),
        default_model: Some(KIMI_DEFAULT_MODEL),
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "minimax",
        default_api_url: Some(MINIMAX_DEFAULT_API_URL),
        default_model: Some(MINIMAX_DEFAULT_MODEL),
        protocol: Protocol::AnthropicMessages,
        path_affix: None,
    },
    ProviderSpec {
        key: "minimax-coding",
        default_api_url: Some(MINIMAX_CODING_DEFAULT_API_URL),
        default_model: Some(MINIMAX_CODING_DEFAULT_MODEL),
        protocol: Protocol::AnthropicMessages,
        path_affix: None,
    },
    ProviderSpec {
        key: "mimo",
        default_api_url: Some(MIMO_DEFAULT_API_URL),
        default_model: Some(MIMO_DEFAULT_MODEL),
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "mimo-coding",
        default_api_url: Some(MIMO_CODING_DEFAULT_API_URL),
        default_model: Some(MIMO_CODING_DEFAULT_MODEL),
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "openai",
        default_api_url: Some(OPENAI_DEFAULT_API_URL),
        default_model: Some(OPENAI_DEFAULT_MODEL),
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "opencode-go",
        default_api_url: Some(OPENCODE_GO_DEFAULT_API_URL),
        default_model: Some(OPENCODE_GO_DEFAULT_MODEL),
        // One of two protocols, decided per model in `resolve_protocol`.
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "opencode-zen",
        default_api_url: Some(OPENCODE_ZEN_DEFAULT_API_URL),
        default_model: Some(OPENCODE_ZEN_DEFAULT_MODEL),
        // One of four protocols, decided per model in `resolve_protocol`.
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "zhipu",
        default_api_url: Some(ZHIPU_DEFAULT_API_URL),
        default_model: Some(ZHIPU_DEFAULT_MODEL),
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
    ProviderSpec {
        key: "zhipu-coding",
        default_api_url: Some(ZHIPU_CODING_DEFAULT_API_URL),
        default_model: Some(ZHIPU_CODING_DEFAULT_MODEL),
        protocol: Protocol::OpenAiChat,
        path_affix: None,
    },
];

/// The row for a provider, or `None` when the table has no row for it.
pub fn spec(provider: AiProvider) -> Option<&'static ProviderSpec> {
    PROVIDERS.iter().find(|spec| spec.key == provider.as_key())
}

/// Which protocol a request for this provider uses.
///
/// Custom and the OpenCode providers front several backends and decide per
/// request; every other provider speaks exactly one protocol.
pub fn resolve_protocol(
    provider: AiProvider,
    config: &AiCompletionConfig,
) -> Result<Protocol, String> {
    match provider {
        AiProvider::Custom => custom::protocol(config),
        AiProvider::OpenCodeGo | AiProvider::OpenCodeZen => {
            let model = resolve_model(config, default_model(provider).unwrap_or_default())?;

            if provider == AiProvider::OpenCodeGo {
                opencode_go::protocol_for_model(model)
            } else {
                opencode_zen::protocol_for_model(model)
            }
        }
        other => spec(other).map(|spec| spec.protocol).ok_or_else(|| {
            format!(
                "provider '{}' has no entry in the provider table",
                other.as_key()
            )
        }),
    }
}

pub fn default_api_url(provider: AiProvider) -> Option<&'static str> {
    spec(provider).and_then(|spec| spec.default_api_url)
}

/// The endpoint a provider's completions are sent to: the configured or
/// default base URL, plus any provider-specific path prefix.
///
/// Both the request and the completion cache key go through this function.
pub fn resolve_endpoint(
    provider: AiProvider,
    config: &AiCompletionConfig,
) -> Result<String, String> {
    let spec = spec(provider);
    let default_url = spec
        .and_then(|spec| spec.default_api_url)
        .unwrap_or_default();
    let base_url = resolve_api_url(config, default_url)?;

    let Some(affix) = spec.and_then(|spec| spec.path_affix) else {
        return Ok(base_url);
    };

    if base_url.ends_with(affix) {
        return Ok(base_url);
    }

    Ok(format!("{base_url}{affix}"))
}

pub fn default_model(provider: AiProvider) -> Option<&'static str> {
    spec(provider).and_then(|spec| spec.default_model)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{default_model, AiProvider};

    /// The table is the single source of truth for defaults and protocols, so
    /// every provider must have a row. The list below is explicit rather than
    /// derived: adding a variant has to be acknowledged here, which is the
    /// point.
    #[test]
    fn the_table_covers_every_provider() {
        let all = [
            AiProvider::Anthropic,
            AiProvider::Custom,
            AiProvider::DeepSeek,
            AiProvider::Google,
            AiProvider::Kimi,
            AiProvider::MiniMax,
            AiProvider::MiniMaxCoding,
            AiProvider::MiMo,
            AiProvider::MiMoCoding,
            AiProvider::OpenAi,
            AiProvider::OpenCodeGo,
            AiProvider::OpenCodeZen,
            AiProvider::Zhipu,
            AiProvider::ZhipuCoding,
        ];

        assert_eq!(
            super::PROVIDERS.len(),
            all.len(),
            "a provider was added or removed without updating the table"
        );

        for provider in all {
            let row =
                super::spec(provider).unwrap_or_else(|| panic!("no table row for {provider:?}"));
            assert_eq!(row.key, provider.as_key(), "{provider:?}");
        }

        // Keys double as the serialized provider name, so they must be unique.
        let mut keys: Vec<_> = super::PROVIDERS.iter().map(|row| row.key).collect();
        keys.sort_unstable();
        let unique = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), unique, "duplicate provider key in the table");
    }

    /// Every provider's built-in default model must exist in the shipped model
    /// catalogue, otherwise the UI and the backend disagree about what will be
    /// requested when the user has not picked a model.
    #[test]
    fn default_models_exist_in_the_catalogue() {
        let catalogue: HashMap<String, Vec<serde_json::Value>> =
            serde_json::from_str(include_str!("../../../src/assets/models.json"))
                .expect("models.json should be valid JSON");

        let providers = [
            AiProvider::Anthropic,
            AiProvider::DeepSeek,
            AiProvider::Google,
            AiProvider::Kimi,
            AiProvider::MiniMax,
            AiProvider::MiniMaxCoding,
            AiProvider::MiMo,
            AiProvider::MiMoCoding,
            AiProvider::OpenAi,
            AiProvider::OpenCodeGo,
            AiProvider::OpenCodeZen,
            AiProvider::Zhipu,
            AiProvider::ZhipuCoding,
        ];

        for provider in providers {
            let model = default_model(provider)
                .unwrap_or_else(|| panic!("provider {provider:?} should declare a default model"));
            let values = catalogue
                .get(provider.as_key())
                .unwrap_or_else(|| panic!("models.json is missing key {}", provider.as_key()));
            let present = values
                .iter()
                .any(|entry| entry.get("value").and_then(|v| v.as_str()) == Some(model));

            assert!(
                present,
                "default model '{model}' for {:?} is not in src/assets/models.json",
                provider
            );
        }

        assert!(default_model(AiProvider::Custom).is_none());
    }
}
