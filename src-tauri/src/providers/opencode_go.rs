//! OpenCode Go fronts several vendors behind one endpoint, so the protocol
//! depends on which model the request names.

use crate::i18n;

use super::Protocol;

/// The protocol this model is served over.
pub(crate) fn protocol_for_model(model: &str) -> Result<Protocol, String> {
    let normalized = model.trim().to_ascii_lowercase();

    if matches_openai_protocol(&normalized) {
        return Ok(Protocol::OpenAiChat);
    }

    if matches_anthropic_protocol(&normalized) {
        return Ok(Protocol::AnthropicMessages);
    }

    Err(i18n::tf(
        "ai.provider.unsupported_model",
        &[("provider", "OpenCode Go"), ("model", model)],
    ))
}

fn matches_openai_protocol(model: &str) -> bool {
    model.starts_with("glm-")
        || model.starts_with("kimi-")
        || model.starts_with("deepseek-")
        || model.starts_with("mimo-")
}

fn matches_anthropic_protocol(model: &str) -> bool {
    model.starts_with("minimax-") || model.starts_with("qwen")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_openai_compatible_models() {
        assert_eq!(
            protocol_for_model("deepseek-v4-pro").unwrap(),
            Protocol::OpenAiChat
        );
        assert_eq!(
            protocol_for_model("kimi-k2.7").unwrap(),
            Protocol::OpenAiChat
        );
    }

    #[test]
    fn routes_anthropic_compatible_models() {
        assert_eq!(
            protocol_for_model("qwen3.7-plus").unwrap(),
            Protocol::AnthropicMessages
        );
        assert_eq!(
            protocol_for_model("minimax-m3").unwrap(),
            Protocol::AnthropicMessages
        );
    }

    #[test]
    fn rejects_unknown_models() {
        let error = protocol_for_model("gpt-5.5").unwrap_err();
        assert!(error.contains("gpt-5.5"), "{error}");
    }
}
