//! The user-configured provider: the endpoint and model are entered by hand
//! and the protocol is chosen in the settings.

use crate::models::ai::{AiCompletionConfig, CustomProviderProtocol};

use super::Protocol;

pub(crate) fn protocol(config: &AiCompletionConfig) -> Result<Protocol, String> {
    Ok(match config.custom_protocol.unwrap_or_default() {
        CustomProviderProtocol::Anthropic => Protocol::AnthropicMessages,
        CustomProviderProtocol::Google => Protocol::GoogleGenerate,
        CustomProviderProtocol::OpenAi => Protocol::OpenAiChat,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::AiCompletionConfig;

    #[test]
    fn defaults_to_the_openai_chat_protocol() {
        assert_eq!(
            protocol(&AiCompletionConfig::default()).unwrap(),
            Protocol::OpenAiChat
        );
    }

    #[test]
    fn follows_the_configured_protocol() {
        for (selected, expected) in [
            (
                CustomProviderProtocol::Anthropic,
                Protocol::AnthropicMessages,
            ),
            (CustomProviderProtocol::Google, Protocol::GoogleGenerate),
            (CustomProviderProtocol::OpenAi, Protocol::OpenAiChat),
        ] {
            let config = AiCompletionConfig {
                custom_protocol: Some(selected),
                ..Default::default()
            };

            assert_eq!(protocol(&config).unwrap(), expected, "{selected:?}");
        }
    }
}
