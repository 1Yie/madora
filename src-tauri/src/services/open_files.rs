//! Markdown files the operating system hands to the app ("Open with Madora",
//! a double-click once Madora is the default, `madora note.md`).
//!
//! Paths arrive from three places: the process arguments at launch, the
//! arguments of a second launch (forwarded by the single-instance plugin) and
//! macOS's `Opened` event. All of them end up in [`PendingOpenFiles`], which the
//! webview drains once it is ready, so a file opened while the page is still
//! loading is never lost.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::mutex::lock_unpoisoned;

/// Whether `path` names a Markdown document by its extension.
pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            ["md", "markdown", "mdx"]
                .iter()
                .any(|known| extension.eq_ignore_ascii_case(known))
        })
}

/// One launch argument as a path to an existing Markdown file.
///
/// Flags, missing files and other file types yield `None`, so passing
/// arbitrary arguments (a macOS `-psn_…`, a future `--flag`) is harmless.
/// A relative path is resolved against `cwd`, the directory the launch
/// happened in, which for a second instance is not ours.
fn markdown_path_from_arg(arg: &str, cwd: Option<&Path>) -> Option<PathBuf> {
    let path = if arg.starts_with("file://") {
        // Some Linux desktops pass `%u`-style URIs instead of plain paths.
        tauri::Url::parse(arg).ok()?.to_file_path().ok()?
    } else {
        PathBuf::from(arg)
    };
    let path = if path.is_absolute() {
        path
    } else {
        cwd?.join(path)
    };

    (is_markdown_path(&path) && path.is_file()).then_some(path)
}

fn dedupe(paths: impl IntoIterator<Item = PathBuf>) -> Vec<PathBuf> {
    let mut unique: Vec<PathBuf> = Vec::new();

    for path in paths {
        if !unique.contains(&path) {
            unique.push(path);
        }
    }

    unique
}

/// The Markdown files named by `args`, which must not include the program name.
pub fn paths_from_args(args: impl IntoIterator<Item = String>, cwd: Option<&Path>) -> Vec<PathBuf> {
    dedupe(
        args.into_iter()
            .filter_map(|arg| markdown_path_from_arg(&arg, cwd)),
    )
}

/// The Markdown files named by the `file://` URLs of a macOS `Opened` event.
pub fn paths_from_urls(urls: &[tauri::Url]) -> Vec<PathBuf> {
    dedupe(urls.iter().filter_map(|url| {
        let path = url.to_file_path().ok()?;

        (is_markdown_path(&path) && path.is_file()).then_some(path)
    }))
}

/// Files waiting for the webview to pick them up.
#[derive(Default)]
pub struct PendingOpenFiles {
    queue: Mutex<Vec<PathBuf>>,
}

impl PendingOpenFiles {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&self, paths: Vec<PathBuf>) {
        lock_unpoisoned(&self.queue).extend(paths);
    }

    /// Empties the queue, so each file is delivered exactly once.
    pub fn take(&self) -> Vec<PathBuf> {
        dedupe(std::mem::take(&mut *lock_unpoisoned(&self.queue)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, "# hi").unwrap();
        path
    }

    #[test]
    fn markdown_extensions_are_recognised_case_insensitively() {
        for name in ["a.md", "a.MD", "a.markdown", "a.Mdx"] {
            assert!(is_markdown_path(Path::new(name)), "{name}");
        }
        for name in ["a.txt", "a.md.bak", "md", "a"] {
            assert!(!is_markdown_path(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn only_existing_markdown_files_are_taken_from_the_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let note = write(dir.path(), "note.md");
        write(dir.path(), "plain.txt");
        std::fs::create_dir(dir.path().join("folder.md")).unwrap();

        let paths = paths_from_args(
            [
                "--some-flag".to_string(),
                note.to_string_lossy().into_owned(),
                dir.path().join("plain.txt").to_string_lossy().into_owned(),
                dir.path().join("missing.md").to_string_lossy().into_owned(),
                dir.path().join("folder.md").to_string_lossy().into_owned(),
            ],
            None,
        );

        assert_eq!(paths, vec![note]);
    }

    #[test]
    fn relative_paths_resolve_against_the_launch_directory() {
        let dir = tempfile::tempdir().unwrap();
        let note = write(dir.path(), "note.md");

        assert_eq!(
            paths_from_args(["note.md".to_string()], Some(dir.path())),
            vec![note]
        );
        // Without a launch directory a relative path cannot be located.
        assert!(paths_from_args(["note.md".to_string()], None).is_empty());
    }

    #[test]
    fn file_urls_in_the_arguments_are_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let note = write(dir.path(), "my note.md");
        let url = tauri::Url::from_file_path(&note).unwrap();

        assert_eq!(paths_from_args([url.to_string()], None), vec![note.clone()]);
        assert_eq!(paths_from_urls(&[url]), vec![note]);
    }

    #[test]
    fn non_file_urls_are_ignored() {
        let url = tauri::Url::parse("https://example.com/readme.md").unwrap();

        assert!(paths_from_urls(&[url]).is_empty());
    }

    #[test]
    fn repeated_paths_are_delivered_once_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let first = write(dir.path(), "a.md");
        let second = write(dir.path(), "b.md");
        let arg = |path: &Path| path.to_string_lossy().into_owned();

        assert_eq!(
            paths_from_args([arg(&first), arg(&second), arg(&first)], None),
            vec![first, second]
        );
    }

    #[test]
    fn taking_the_pending_files_empties_the_queue() {
        let pending = PendingOpenFiles::new();
        pending.push(vec![PathBuf::from("/a.md")]);
        pending.push(vec![PathBuf::from("/b.md"), PathBuf::from("/a.md")]);

        assert_eq!(
            pending.take(),
            vec![PathBuf::from("/a.md"), PathBuf::from("/b.md")]
        );
        assert!(pending.take().is_empty());
    }
}
