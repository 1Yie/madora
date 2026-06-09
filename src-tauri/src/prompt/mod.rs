use std::{collections::HashMap, env, fs, path::PathBuf};

use serde::Serialize;

use crate::models::ai::AiProvider;

const DEFAULT_PROMPTS_DIR: &str = "prompts";

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
        provider: AiProvider,
        name: &str,
        context: &T,
    ) -> String {
        self.render_template(provider, name, context)
    }

    fn render_template<T: Serialize>(
        &self,
        provider: AiProvider,
        name: &str,
        context: &T,
    ) -> String {
        let template = self
            .load_prompt(provider, name)
            .or_else(|| self.load_prompt(AiProvider::Custom, name))
            .unwrap_or_default();

        render_template(&template, context)
    }

    fn load_prompt(&self, provider: AiProvider, name: &str) -> Option<String> {
        let relative_path = PathBuf::from(provider.as_key()).join(format!("{name}.md"));

        if let Some(user_root) = &self.user_root {
            let prompt_path = user_root.join(&relative_path);

            if prompt_path.exists() {
                return fs::read_to_string(prompt_path).ok();
            }
        }

        default_prompt_template(provider, name).map(str::to_string)
    }
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
    ($(($provider:path, $name:literal, $path:literal)),* $(,)?) => {
        fn default_prompt_template(
            provider: AiProvider,
            name: &str,
        ) -> Option<&'static str> {
            match (provider, name) {
                $(
                    ($provider, $name) => Some(include_str!(concat!(
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
        AiProvider::Anthropic,
        "fim_system",
        "/prompts/anthropic/fim_system.md"
    ),
    (
        AiProvider::Anthropic,
        "fim_user",
        "/prompts/anthropic/fim_user.md"
    ),

    // Custom
    (
        AiProvider::Custom,
        "fim_system",
        "/prompts/custom/fim_system.md"
    ),
    (
        AiProvider::Custom,
        "fim_user",
        "/prompts/custom/fim_user.md"
    ),

    // Kimi
    (
        AiProvider::Kimi,
        "fim_system",
        "/prompts/kimi/fim_system.md"
    ),
    (
        AiProvider::Kimi,
        "fim_user",
        "/prompts/kimi/fim_user.md"
    ),

    // MiMo
    (
        AiProvider::MiMo,
        "fim_system",
        "/prompts/mimo/fim_system.md"
    ),
    (
        AiProvider::MiMo,
        "fim_user",
        "/prompts/mimo/fim_user.md"
    ),

    // MiniMax
    (
        AiProvider::MiniMax,
        "fim_system",
        "/prompts/minimax/fim_system.md"
    ),
    (
        AiProvider::MiniMax,
        "fim_user",
        "/prompts/minimax/fim_user.md"
    ),
    // MiMo Coding Plan
    (
        AiProvider::MiMoCoding,
        "fim_system",
        "/prompts/mimo/fim_system.md"
    ),
    (
        AiProvider::MiMoCoding,
        "fim_user",
        "/prompts/mimo/fim_user.md"
    ),

    // OpenAI

    (
        AiProvider::OpenAi,
        "fim_system",
        "/prompts/openai/fim_system.md"
    ),
    (
        AiProvider::OpenAi,
        "fim_user",
        "/prompts/openai/fim_user.md"
    ),
}
