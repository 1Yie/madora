use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::i18n;
use crate::models::ai::AiProvider;

const DEFAULT_PROMPTS_DIR: &str = "prompts";

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
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

/// Templates are read once, when the manager is built. Rendering never
/// touches the disk (it runs on every completion), and the revision is derived
/// from exactly the text that will be rendered, so the completion cache can
/// never mix output from two template versions. Editing a user template
/// takes effect after a restart.
#[derive(Clone)]
pub struct PromptManager {
    templates: HashMap<(PromptProfile, &'static str), String>,
    revision: u64,
}

const TEMPLATE_NAMES: [&str; 2] = ["fim_system", "fim_user"];

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
        Self::from_user_root(resolve_user_prompt_root().as_deref())
    }

    /// Builds a manager whose templates come from `user_root` where a user
    /// override exists and from the compiled-in defaults otherwise.
    pub(crate) fn from_user_root(user_root: Option<&Path>) -> Self {
        let mut templates = HashMap::new();

        for profile in PromptProfile::ALL {
            for name in TEMPLATE_NAMES {
                if let Some(template) = load_template(user_root, profile, name) {
                    templates.insert((profile, name), template);
                }
            }
        }

        let revision = compute_template_revision(&templates);

        Self {
            templates,
            revision,
        }
    }

    pub fn render_prompt<T: Serialize>(
        &self,
        profile: PromptProfile,
        name: &str,
        context: &T,
    ) -> Result<String, String> {
        if !is_safe_template_name(name) {
            return Err(i18n::tf("ai.template_invalid_name", &[("name", name)]));
        }

        let template = self
            .template(profile, name)
            .or_else(|| {
                if profile == PromptProfile::Custom {
                    None
                } else {
                    self.template(PromptProfile::Custom, name)
                }
            })
            .ok_or_else(|| {
                i18n::tf(
                    "ai.template_not_found",
                    &[("name", name), ("profile", profile.as_key())],
                )
            })?;

        render_template(template, context)
    }

    /// Stable fingerprint of the effective prompt templates, used to keep the
    /// completion cache from serving results rendered from other templates.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    fn template(&self, profile: PromptProfile, name: &str) -> Option<&str> {
        TEMPLATE_NAMES
            .iter()
            .find(|candidate| **candidate == name)
            .and_then(|name| self.templates.get(&(profile, *name)))
            .map(String::as_str)
    }
}

fn load_template(user_root: Option<&Path>, profile: PromptProfile, name: &str) -> Option<String> {
    if let Some(user_root) = user_root {
        let prompt_path = user_root.join(profile.as_key()).join(format!("{name}.md"));

        if prompt_path.exists() {
            // A user override that exists but cannot be read is skipped, so
            // the built-in template is used instead of sending an empty prompt.
            if let Ok(template) = fs::read_to_string(&prompt_path) {
                return Some(template);
            }
        }
    }

    default_prompt_template(profile, name).map(str::to_string)
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
        // Qwen is served over this protocol by the multiplexing providers and
        // is tuned like Claude. The check lives here rather than in
        // `prompt_profile_from_model` so that a qwen model reached over the
        // OpenAI-chat protocol cannot pick up the Anthropic template.
        _ if is_qwen(model) => PromptProfile::Anthropic,
        _ => prompt_profile_from_model(model).unwrap_or(PromptProfile::Anthropic),
    }
}

fn is_qwen(model: &str) -> bool {
    model.trim().to_ascii_lowercase().starts_with("qwen")
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

    if lower_model.starts_with("claude-") {
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
        .map_err(|error| {
            i18n::tf(
                "ai.template_context_invalid",
                &[("error", &error.to_string())],
            )
        })
        .and_then(|value| {
            flatten_template_values(value).ok_or_else(|| i18n::t("ai.template_context_not_object"))
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

fn compute_template_revision(templates: &HashMap<(PromptProfile, &'static str), String>) -> u64 {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();

    // Fixed iteration order, so the value is the same on every start.
    for profile in PromptProfile::ALL {
        for name in TEMPLATE_NAMES {
            name.hash(&mut hasher);
            templates.get(&(profile, name)).hash(&mut hasher);
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

    #[test]
    fn qwen_only_selects_the_anthropic_profile_on_the_anthropic_protocol() {
        assert_eq!(
            prompt_profile_for_anthropic_compatible(AiProvider::OpenCodeGo, "qwen3.7-max"),
            PromptProfile::Anthropic
        );
        assert_eq!(
            prompt_profile_for_openai_compatible(AiProvider::OpenCodeZen, "qwen3.7-max"),
            PromptProfile::OpenAi
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

    // ─── template snapshot ───────────────────────────────────────

    fn write_override(root: &std::path::Path, profile: &str, name: &str, body: &str) {
        let dir = root.join(profile);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{name}.md")), body).unwrap();
    }

    #[test]
    fn user_override_replaces_the_builtin_template() {
        let dir = tempfile::tempdir().unwrap();
        write_override(dir.path(), "openai", "fim_user", "custom {{prefix}}");
        let manager = super::PromptManager::from_user_root(Some(dir.path()));

        let rendered = manager
            .render_prompt(PromptProfile::OpenAi, "fim_user", &context("HELLO", ""))
            .unwrap();

        assert_eq!(rendered, "custom HELLO");
    }

    #[test]
    fn revision_changes_with_template_content_and_is_stable_otherwise() {
        let plain = super::PromptManager::from_user_root(None);
        let again = super::PromptManager::from_user_root(None);
        assert_eq!(plain.revision(), again.revision());

        let dir = tempfile::tempdir().unwrap();
        write_override(dir.path(), "kimi", "fim_system", "different system prompt");
        let overridden = super::PromptManager::from_user_root(Some(dir.path()));
        assert_ne!(plain.revision(), overridden.revision());
    }

    #[test]
    fn rendering_does_not_reread_the_disk() {
        let dir = tempfile::tempdir().unwrap();
        write_override(dir.path(), "openai", "fim_user", "v1 {{prefix}}");
        let manager = super::PromptManager::from_user_root(Some(dir.path()));
        let before = manager.revision();

        // An edit made while the app runs is not picked up: the snapshot and
        // its revision stay consistent with each other.
        write_override(dir.path(), "openai", "fim_user", "v2 {{prefix}}");
        let rendered = manager
            .render_prompt(PromptProfile::OpenAi, "fim_user", &context("X", ""))
            .unwrap();

        assert_eq!(rendered, "v1 X");
        assert_eq!(manager.revision(), before);
    }

    #[test]
    fn unreadable_override_falls_back_to_the_builtin_template() {
        let dir = tempfile::tempdir().unwrap();
        // A directory where the file should be makes the read fail.
        std::fs::create_dir_all(dir.path().join("openai/fim_user.md")).unwrap();
        let manager = super::PromptManager::from_user_root(Some(dir.path()));

        let rendered = manager
            .render_prompt(PromptProfile::OpenAi, "fim_user", &context("P", "S"))
            .unwrap();

        assert!(
            rendered.contains('P'),
            "built-in template should render: {rendered}"
        );
        assert!(!rendered.is_empty());
    }

    #[test]
    fn every_profile_has_both_builtin_templates() {
        let manager = super::PromptManager::from_user_root(None);

        for profile in PromptProfile::ALL {
            for name in super::TEMPLATE_NAMES {
                assert!(
                    manager
                        .render_prompt(profile, name, &context("p", "s"))
                        .is_ok(),
                    "{profile:?}/{name} is missing"
                );
            }
        }
    }
}
