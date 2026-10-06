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

    const ALL: [Self; 8] = [
        Self::Anthropic,
        Self::Custom,
        Self::DeepSeek,
        Self::Google,
        Self::Kimi,
        Self::MiMo,
        Self::MiniMax,
        Self::OpenAi,
    ];
}

#[derive(Clone)]
pub struct PromptManager {
    user_root: Option<PathBuf>,
    revision: std::sync::OnceLock<u64>,
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
            revision: std::sync::OnceLock::new(),
        }
    }

    pub fn render_prompt<T: Serialize>(
        &self,
        profile: PromptProfile,
        name: &str,
        context: &T,
    ) -> Result<String, String> {
        if !is_safe_template_name(name) {
            return Err(format!("invalid prompt template name '{name}'"));
        }

        let template = self
            .load_prompt(profile, name)
            .or_else(|| {
                if profile == PromptProfile::Custom {
                    None
                } else {
                    self.load_prompt(PromptProfile::Custom, name)
                }
            })
            .ok_or_else(|| {
                format!(
                    "prompt template '{name}' for profile '{}' was not found",
                    profile.as_key()
                )
            })?;

        render_template(&template, context)
    }

    /// Stable fingerprint of the effective prompt templates, used to keep the
    /// completion cache from serving results rendered from older templates.
    pub fn revision(&self) -> u64 {
        *self
            .revision
            .get_or_init(|| compute_template_revision(self))
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

fn render_template<T: Serialize>(template: &str, context: &T) -> Result<String, String> {
    let values = serde_json::to_value(context)
        .map_err(|error| format!("failed to serialize prompt context: {error}"))
        .and_then(|value| {
            flatten_template_values(value)
                .ok_or_else(|| "prompt context must serialize to an object".to_string())
        })?;

    // Single left-to-right pass: substituted values are never rescanned, so a
    // document containing `{{suffix}}` cannot trigger another substitution.
    let mut rendered = String::with_capacity(template.len());
    let mut rest = template;

    while let Some(start) = rest.find("{{") {
        rendered.push_str(&rest[..start]);
        let after = &rest[start + 2..];

        if let Some(end) = after.find("}}") {
            let name = after[..end].trim();

            match values.get(name) {
                Some(value) => rendered.push_str(value),
                None => {
                    rendered.push_str("{{");
                    rendered.push_str(&after[..end]);
                    rendered.push_str("}}");
                }
            }

            rest = &after[end + 2..];
        } else {
            rendered.push_str("{{");
            rest = after;
        }
    }

    rendered.push_str(rest);
    Ok(rendered)
}

fn is_safe_template_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '_' || value == '-')
}

fn compute_template_revision(manager: &PromptManager) -> u64 {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();

    for profile in PromptProfile::ALL {
        for name in ["fim_system", "fim_user"] {
            name.hash(&mut hasher);
            manager.load_prompt(profile, name).hash(&mut hasher);
        }
    }

    hasher.finish()
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

    // ─── render_template ─────────────────────────────────────────

    fn context(prefix: &str, suffix: &str) -> crate::prompt::PromptContext {
        crate::prompt::PromptContext {
            prefix: prefix.to_string(),
            suffix: suffix.to_string(),
            suffix_hint: String::new(),
            title: "Doc".to_string(),
        }
    }

    #[test]
    fn renders_variables_in_a_single_pass() {
        // The substituted value itself contains `{{suffix}}` and must not be
        // substituted again.
        let rendered =
            super::render_template("[{{prefix}}][{{suffix}}]", &context("{{suffix}}", "TAIL"))
                .unwrap();

        assert_eq!(rendered, "[{{suffix}}][TAIL]");
    }

    #[test]
    fn keeps_unknown_placeholders_verbatim() {
        let rendered =
            super::render_template("{{prefix}} {{unknown}} {{suffix}}", &context("A", "B"))
                .unwrap();

        assert_eq!(rendered, "A {{unknown}} B");
    }

    #[test]
    fn rendering_is_deterministic_and_does_not_depend_on_map_order() {
        let template = "{{prefix}}|{{title}}|{{suffix}}";
        let first = super::render_template(template, &context("p", "s")).unwrap();

        for _ in 0..16 {
            assert_eq!(
                super::render_template(template, &context("p", "s")).unwrap(),
                first
            );
        }
    }

    #[test]
    fn missing_template_returns_an_error() {
        let manager = super::PromptManager::new();
        let result =
            manager.render_prompt(PromptProfile::OpenAi, "does_not_exist", &context("p", "s"));

        assert!(result.is_err());
    }

    #[test]
    fn rejects_unsafe_template_names() {
        assert!(!super::is_safe_template_name("../secret"));
        assert!(!super::is_safe_template_name("a/b"));
        assert!(super::is_safe_template_name("fim_system"));
        assert!(super::is_safe_template_name("fim-user"));
    }
}
