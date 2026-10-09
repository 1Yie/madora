//! How this process was started, which decides how much of Madora it runs.
//!
//! Madora started by hand is the whole app: workspace, saved state, tray, sync
//! server, a single instance that later launches hand over to. Madora started
//! *to open a Markdown file* (a double-click once it is the default editor,
//! "Open with", `madora note.md`) is a one-off preview/editor: one window, no
//! tray, no background services, no claim on the single-instance lock, and the
//! process ends with the window. Only the former owns the workspace and the
//! saved state.

use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LaunchMode {
    /// The full app.
    Full,
    /// A lightweight process for the Markdown files it was launched with.
    Document,
}

impl LaunchMode {
    /// Naming files at launch is what makes a process a document launch.
    pub fn for_launch_files(files: &[PathBuf]) -> Self {
        if files.is_empty() {
            Self::Full
        } else {
            Self::Document
        }
    }

    pub fn is_full(self) -> bool {
        self == Self::Full
    }

    pub fn is_document(self) -> bool {
        self == Self::Document
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_files_is_the_full_app() {
        assert_eq!(LaunchMode::for_launch_files(&[]), LaunchMode::Full);
        assert!(LaunchMode::Full.is_full());
        assert!(!LaunchMode::Full.is_document());
    }

    #[test]
    fn naming_files_is_a_document_launch() {
        let files = [PathBuf::from("/tmp/note.md")];

        assert_eq!(LaunchMode::for_launch_files(&files), LaunchMode::Document);
        assert!(LaunchMode::Document.is_document());
        assert!(!LaunchMode::Document.is_full());
    }

    #[test]
    fn the_webview_receives_the_mode_as_a_lowercase_word() {
        assert_eq!(
            serde_json::to_string(&LaunchMode::Full).unwrap(),
            "\"full\""
        );
        assert_eq!(
            serde_json::to_string(&LaunchMode::Document).unwrap(),
            "\"document\""
        );
    }
}
