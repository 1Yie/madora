//! Markdown files the operating system hands to the app ("Open with Madora",
//! a double-click once Madora is the default, `madora note.md`).
//!
//! Paths arrive from three places: the process arguments at launch, the
//! arguments of a second launch (forwarded by the single-instance plugin) and
//! macOS's `Opened` event. All of them end up in [`PendingOpenFiles`], which the
//! webview drains once it is ready, so a file opened while the page is still
//! loading is never lost.

use std::ffi::{OsStr, OsString};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use super::mutex::lock_unpoisoned;
use super::paths;

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

/// `path` without `.` components and with `..` folded into its parent, the
/// form the workspace tree uses, so the same file opened as `./note.md` and
/// as `note.md` is one tab.
///
/// Folding `..` is only right when the component before it is not a symlink;
/// if the folded path names a different file, the resolved one is used.
fn normalize(path: &Path) -> PathBuf {
    let mut folded = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if matches!(folded.components().next_back(), Some(Component::Normal(_))) {
                    folded.pop();
                } else {
                    folded.push(component);
                }
            }
            _ => folded.push(component),
        }
    }

    if folded == path || paths::same_location(&folded, path) {
        folded
    } else {
        path.canonicalize().unwrap_or(folded)
    }
}

/// `path` if it is an existing Markdown file the webview can name.
///
/// The webview receives paths as strings, so a name that is not valid UTF-8
/// could only arrive mangled and is skipped instead.
fn accept(path: PathBuf) -> Option<PathBuf> {
    (path.to_str().is_some() && is_markdown_path(&path) && path.is_file()).then(|| normalize(&path))
}

/// One launch argument as a path to an existing Markdown file.
///
/// Flags, missing files and other file types yield `None`, so passing
/// arbitrary arguments (a macOS `-psn_…`, a future `--flag`) is harmless.
/// A relative path is resolved against `cwd`, the directory the launch
/// happened in, which for a second instance is not ours.
fn markdown_path_from_arg(arg: &OsStr, cwd: Option<&Path>) -> Option<PathBuf> {
    let path = match arg.to_str() {
        // Some Linux desktops pass `%u`-style URIs instead of plain paths.
        Some(url) if url.starts_with("file://") => {
            tauri::Url::parse(url).ok()?.to_file_path().ok()?
        }
        _ => PathBuf::from(arg),
    };
    let path = if path.is_absolute() {
        path
    } else {
        cwd?.join(path)
    };

    accept(path)
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
///
/// Takes `OsString`s as well as `String`s: the launch arguments are read with
/// `args_os`, because a file name that is not valid UTF-8 must not panic the
/// app before its window opens.
pub fn paths_from_args<I>(args: I, cwd: Option<&Path>) -> Vec<PathBuf>
where
    I: IntoIterator,
    I::Item: Into<OsString>,
{
    dedupe(
        args.into_iter()
            .filter_map(|arg| markdown_path_from_arg(&arg.into(), cwd)),
    )
}

/// The Markdown files named by the `file://` URLs of a macOS `Opened` event.
pub fn paths_from_urls(urls: &[tauri::Url]) -> Vec<PathBuf> {
    dedupe(
        urls.iter()
            .filter_map(|url| accept(url.to_file_path().ok()?)),
    )
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
    fn dot_segments_are_folded_so_one_file_is_one_path() {
        let dir = tempfile::tempdir().unwrap();
        let note = write(dir.path(), "note.md");
        std::fs::create_dir(dir.path().join("sub")).unwrap();

        assert_eq!(
            paths_from_args(
                ["./note.md", "sub/../note.md", "note.md"].map(String::from),
                Some(dir.path()),
            ),
            vec![note]
        );
    }

    #[cfg(unix)]
    #[test]
    fn parent_of_a_symlinked_directory_is_not_folded_into_the_wrong_file() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real");
        std::fs::create_dir_all(real.join("inner")).unwrap();
        let target = write(&real, "note.md");
        write(dir.path(), "note.md");
        std::os::unix::fs::symlink(real.join("inner"), dir.path().join("link")).unwrap();

        // `link/..` is `real`, not `dir`.
        assert_eq!(
            paths_from_args(["link/../note.md".to_string()], Some(dir.path())),
            vec![target.canonicalize().unwrap()]
        );
    }

    #[cfg(unix)]
    #[test]
    fn arguments_that_are_not_utf8_are_skipped_without_panicking() {
        use std::os::unix::ffi::OsStringExt;

        let dir = tempfile::tempdir().unwrap();
        let note = write(dir.path(), "note.md");
        let mut invalid = dir.path().as_os_str().to_os_string().into_vec();
        invalid.extend_from_slice(b"/\xff.md");
        let invalid = OsString::from_vec(invalid);
        std::fs::write(&invalid, "# hi").unwrap();

        assert_eq!(
            paths_from_args([invalid, note.clone().into_os_string()], None,),
            vec![note]
        );
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
