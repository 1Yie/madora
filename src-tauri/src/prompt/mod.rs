use std::{collections::HashMap, env, fs, path::PathBuf};

use serde::Serialize;

use crate::models::ai::AiProvider;

const DEFAULT_PROMPTS_DIR: &str = "prompts";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PromptProfile {
    Anthropic,
    Custom,
    DeepSeek,
    Google,
    Kimi,
    MiMo,
    MiniMax,
    OpenAi,
}

impl PromptProfile {
    fn as_key(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::Custom => "custom",
            Self::DeepSeek => "deepseek",
            Self::Google => "google",
            Self::Kimi => "kimi",
            Self::MiMo => "mimo",
            Self::MiniMax => "minimax",
            Self::OpenAi => "openai",
        }
    }
}

#[derive(Clone)]
pub struct PromptManager {
    user_root: Option<PathBuf>,
}

#[derive(Serialize)]
pub struct PromptContext {
    pub prefix: String,
    pub suffix: String,
    pub suffix_hint: String,
    pub title: String,
}

impl Default for PromptManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PromptManager {
    pub fn new() -> Self {
        Self {
            user_root: resolve_user_prompt_root(),
        }
    }

    pub fn render_prompt<T: Serialize>(
        &self,
        profile: PromptProfile,
        name: &str,
        context: &T,
    ) -> String {
        self.render_template(profile, name, context)
    }

    fn render_template<T: Serialize>(
        &self,
        profile: PromptProfile,
        name: &str,
        context: &T,
    ) -> String {
        let template = self
            .load_prompt(profile, name)
            .or_else(|| {
                if profile == PromptProfile::Custom {
                    None
                } else {
                    self.load_prompt(PromptProfile::Custom, name)
                }
            })
            .unwrap_or_default();

        render_template(&template, context)
    }

    fn load_prompt(&self, profile: PromptProfile, name: &str) -> Option<String> {
        let relative_path = PathBuf::from(profile.as_key()).join(format!("{name}.md"));

        if let Some(user_root) = &self.user_root {
            let prompt_path = user_root.join(&relative_path);

            if prompt_path.exists() {
                return fs::read_to_string(prompt_path).ok();
            }
        }

        default_prompt_template(profile, name).map(str::to_string)
    }
}

pub fn prompt_profile_for_openai_compatible(provider: AiProvider, model: &str) -> PromptProfile {
    match provider {
        AiProvider::Custom => PromptProfile::Custom,
        AiProvider::DeepSeek => PromptProfile::DeepSeek,
        AiProvider::Kimi => PromptProfile::Kimi,
        AiProvider::MiMo | AiProvider::MiMoCoding => PromptProfile::MiMo,
        AiProvider::OpenAi | AiProvider::Zhipu | AiProvider::ZhipuCoding => PromptProfile::OpenAi,
        _ => prompt_profile_from_model(model).unwrap_or(PromptProfile::OpenAi),
    }
}

pub fn prompt_profile_for_anthropic_compatible(provider: AiProvider, model: &str) -> PromptProfile {
    match provider {
        AiProvider::Custom => PromptProfile::Custom,
        AiProvider::MiniMax | AiProvider::MiniMaxCoding => PromptProfile::MiniMax,
        AiProvider::Anthropic => PromptProfile::Anthropic,
        _ => prompt_profile_from_model(model).unwrap_or(PromptProfile::Anthropic),
    }
}

pub fn prompt_profile_for_google_compatible(provider: AiProvider, model: &str) -> PromptProfile {
    match provider {
        AiProvider::Custom => PromptProfile::Custom,
        AiProvider::Google => PromptProfile::Google,
        _ => prompt_profile_from_model(model).unwrap_or(PromptProfile::Google),
    }
}

fn prompt_profile_from_model(model: &str) -> Option<PromptProfile> {
    let lower_model = model.trim().to_ascii_lowercase();

    if lower_model.starts_with("claude-") || lower_model.starts_with("qwen") {
        return Some(PromptProfile::Anthropic);
    }

    if lower_model.starts_with("deepseek-") {
        return Some(PromptProfile::DeepSeek);
    }

    if lower_model.starts_with("gemini-") {
        return Some(PromptProfile::Google);
    }

    if lower_model.starts_with("kimi-") || lower_model.starts_with("moonshot-") {
        return Some(PromptProfile::Kimi);
    }

    if lower_model.starts_with("mimo-") {
        return Some(PromptProfile::MiMo);
    }

    if lower_model.starts_with("minimax-") {
        return Some(PromptProfile::MiniMax);
    }

    None
}

fn resolve_user_prompt_root() -> Option<PathBuf> {
    resolve_platform_prompt_root()
}

#[cfg(target_os = "windows")]
fn resolve_platform_prompt_root() -> Option<PathBuf> {
    let config_root = env::var_os("APPDATA")?;

    Some(
        PathBuf::from(config_root)
            .join("madora")
            .join(DEFAULT_PROMPTS_DIR),
    )
}

#[cfg(not(target_os = "windows"))]
fn resolve_platform_prompt_root() -> Option<PathBuf> {
    if let Some(config_root) = env::var_os("XDG_CONFIG_HOME") {
        return Some(
            PathBuf::from(config_root)
                .join("madora")
                .join(DEFAULT_PROMPTS_DIR),
        );
    }

    let home_dir = env::var_os("HOME")?;

    Some(
        PathBuf::from(home_dir)
            .join(".config")
            .join("madora")
            .join(DEFAULT_PROMPTS_DIR),
    )
}

fn render_template<T: Serialize>(template: &str, context: &T) -> String {
    let values = serde_json::to_value(context)
        .ok()
        .and_then(flatten_template_values)
        .unwrap_or_default();

    let mut rendered = template.to_string();

    for (key, value) in values {
        rendered = rendered.replace(&format!("{{{{{key}}}}}"), &value);
    }

    rendered
}

fn flatten_template_values(value: serde_json::Value) -> Option<HashMap<String, String>> {
    let object = value.as_object()?;

    Some(
        object
            .iter()
            .map(|(key, value)| {
                let value = match value {
                    serde_json::Value::Null => String::new(),
                    serde_json::Value::String(value) => value.clone(),
                    other => other.to_string(),
                };

                (key.clone(), value)
            })
            .collect(),
    )
}

macro_rules! prompt_templates {
    ($(($profile:path, $name:literal, $path:literal)),* $(,)?) => {
        fn default_prompt_template(
            profile: PromptProfile,
            name: &str,
        ) -> Option<&'static str> {
            match (profile, name) {
                $(
                    ($profile, $name) => Some(include_str!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        $path
                    ))),
                )*
                _ => None,
            }
        }
    };
}

prompt_templates! {
    // Anthropic
    (
        PromptProfile::Anthropic,
        "fim_system",
        "/prompts/anthropic/fim_system.md"
    ),
    (
        PromptProfile::Anthropic,
        "fim_user",
        "/prompts/anthropic/fim_user.md"
    ),

    // Custom
    (
        PromptProfile::Custom,
        "fim_system",
        "/prompts/custom/fim_system.md"
    ),
    (
        PromptProfile::Custom,
        "fim_user",
        "/prompts/custom/fim_user.md"
    ),

    // DeepSeek
    (
        PromptProfile::DeepSeek,
        "fim_system",
        "/prompts/deepseek/fim_system.md"
    ),
    (
        PromptProfile::DeepSeek,
        "fim_user",
        "/prompts/deepseek/fim_user.md"
    ),

    // Google
    (
        PromptProfile::Google,
        "fim_system",
        "/prompts/google/fim_system.md"
    ),
    (
        PromptProfile::Google,
        "fim_user",
        "/prompts/google/fim_user.md"
    ),

    // Kimi
    (
        PromptProfile::Kimi,
        "fim_system",
        "/prompts/kimi/fim_system.md"
    ),
    (
        PromptProfile::Kimi,
        "fim_user",
        "/prompts/kimi/fim_user.md"
    ),

    // MiMo
    (
        PromptProfile::MiMo,
        "fim_system",
        "/prompts/mimo/fim_system.md"
    ),
    (
        PromptProfile::MiMo,
        "fim_user",
        "/prompts/mimo/fim_user.md"
    ),

    // MiniMax
    (
        PromptProfile::MiniMax,
        "fim_system",
        "/prompts/minimax/fim_system.md"
    ),
    (
        PromptProfile::MiniMax,
        "fim_user",
        "/prompts/minimax/fim_user.md"
    ),

    // OpenAI
    (
        PromptProfile::OpenAi,
        "fim_system",
        "/prompts/openai/fim_system.md"
    ),
    (
        PromptProfile::OpenAi,
        "fim_user",
        "/prompts/openai/fim_user.md"
    ),
}

#[cfg(test)]
mod tests {
    use super::{
        prompt_profile_for_anthropic_compatible, prompt_profile_for_google_compatible,
        prompt_profile_for_openai_compatible, PromptProfile,
    };
    use crate::models::ai::AiProvider;

    #[test]
    fn keeps_custom_prompts_for_custom_provider() {
        assert_eq!(
            prompt_profile_for_openai_compatible(AiProvider::Custom, "gpt-5.1"),
            PromptProfile::Custom
        );
        assert_eq!(
            prompt_profile_for_google_compatible(AiProvider::Custom, "gemini-3.1-pro"),
            PromptProfile::Custom
        );
    }

    #[test]
    fn routes_multiplexed_openai_providers_by_model_family() {
        assert_eq!(
            prompt_profile_for_openai_compatible(AiProvider::OpenCodeZen, "deepseek-v4-pro"),
            PromptProfile::DeepSeek
        );
        assert_eq!(
            prompt_profile_for_openai_compatible(AiProvider::OpenCodeZen, "kimi-k2.7-code"),
            PromptProfile::Kimi
        );
        assert_eq!(
            prompt_profile_for_openai_compatible(AiProvider::OpenCodeZen, "glm-5.2"),
            PromptProfile::OpenAi
        );
    }

    #[test]
    fn routes_multiplexed_anthropic_providers_by_model_family() {
        assert_eq!(
            prompt_profile_for_anthropic_compatible(AiProvider::OpenCodeGo, "MiniMax-M3"),
            PromptProfile::MiniMax
        );
        assert_eq!(
            prompt_profile_for_anthropic_compatible(AiProvider::OpenCodeZen, "claude-sonnet-4.6"),
            PromptProfile::Anthropic
        );
    }

    #[test]
    fn routes_google_models_to_google_prompts() {
        assert_eq!(
            prompt_profile_for_google_compatible(AiProvider::Google, "gemini-3.5-flash"),
            PromptProfile::Google
        );
        assert_eq!(
            prompt_profile_for_google_compatible(AiProvider::OpenCodeZen, "gemini-3.1-pro"),
            PromptProfile::Google
        );
    }
}
