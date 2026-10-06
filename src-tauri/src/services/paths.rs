//! Filesystem path containment helpers shared by every command that touches
//! the workspace.
//!
//! The checks here are canonicalisation based: symlinks and `..` segments are
//! resolved by the operating system before the containment test, so a lexical
//! prefix match can no longer be fooled by `/ws/../elsewhere`.

use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::i18n;

fn outside_workspace() -> String {
    i18n::t("explorer.outside_workspace")
}

fn canonical_root(root: &Path) -> Result<PathBuf, String> {
    root.canonicalize().map_err(|_| {
        i18n::tf(
            "explorer.path_not_exist",
            &[("path", &root.display().to_string())],
        )
    })
}

/// Resolves `path` to an absolute path with every symlink and `..` resolved,
/// even when the trailing components do not exist yet (a file about to be
/// created). The nearest existing ancestor is canonicalised and the missing
/// tail is appended; a `..` inside the missing tail, or a dangling symlink,
/// is refused because neither can be resolved safely.
pub fn resolve_lenient(path: &Path) -> Result<PathBuf, String> {
    let mut tail: Vec<OsString> = Vec::new();
    let mut current = path.to_path_buf();

    loop {
        match current.canonicalize() {
            Ok(mut resolved) => {
                for name in tail.iter().rev() {
                    resolved.push(name);
                }
                return Ok(resolved);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                // A dangling symlink also canonicalises to NotFound, but
                // writing through it would create its (unchecked) target.
                if fs::symlink_metadata(&current).is_ok() {
                    return Err(outside_workspace());
                }

                match (current.file_name(), current.parent()) {
                    (Some(name), Some(parent)) => {
                        tail.push(name.to_os_string());
                        current = parent.to_path_buf();
                    }
                    // Ends in `..` or ran out of ancestors.
                    _ => return Err(outside_workspace()),
                }
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

/// Fails unless `path` resolves to `root` or something inside it. Returns the
/// resolved path.
pub fn ensure_within(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = canonical_root(root)?;
    let resolved = resolve_lenient(path)?;

    if resolved.starts_with(&root) {
        Ok(resolved)
    } else {
        Err(outside_workspace())
    }
}

/// Like [`ensure_within`], but a symlink in the final component is treated as
/// the entry itself rather than followed. Use it for operations that act on
/// the directory entry (rename, delete, move) so a link pointing outside the
/// workspace can still be removed. Returns the resolved entry path.
pub fn ensure_entry_within(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = canonical_root(root)?;
    let (Some(name), Some(parent)) = (path.file_name(), path.parent()) else {
        return Err(outside_workspace());
    };
    let entry = resolve_lenient(parent)?.join(name);

    if entry.starts_with(&root) {
        Ok(entry)
    } else {
        Err(outside_workspace())
    }
}

/// Whether two paths refer to the same existing location.
pub fn same_location(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Canonical form of the workspace root, used to protect the root itself.
pub fn canonical_root_of(root: &Path) -> Result<PathBuf, String> {
    canonical_root(root)
}

/// Version-control internals and SSH material are never something a rendered
/// document needs, and they commonly hold credentials.
pub fn is_protected_path(relative: &Path) -> bool {
    relative.components().any(|component| {
        component.as_os_str().to_str().is_some_and(|name| {
            name.eq_ignore_ascii_case(".git") || name.eq_ignore_ascii_case(".ssh")
        })
    })
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Writes `bytes` to `path` without ever exposing a half-written file: the
/// data goes to a temporary file in the same directory, is flushed, and is
/// then renamed over the target. Writes through a symlink update the link
/// target and keep the link, and the existing permissions are preserved.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let target = match fs::canonicalize(path) {
        Ok(real) => real,
        Err(error) if error.kind() == io::ErrorKind::NotFound => path.to_path_buf(),
        Err(error) => return Err(error),
    };
    let (Some(dir), Some(file_name)) = (target.parent(), target.file_name()) else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "path has no file name",
        ));
    };

    let mut temp_name = OsString::from(".");
    temp_name.push(file_name);
    temp_name.push(format!(
        ".{}-{}.tmp",
        std::process::id(),
        TEMP_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let temp_path = dir.join(temp_name);

    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);

        if let Ok(metadata) = fs::metadata(&target) {
            let _ = fs::set_permissions(&temp_path, metadata.permissions());
        }

        fs::rename(&temp_path, &target)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ws");
        fs::create_dir_all(root.join("sub")).unwrap();
        (dir, root)
    }

    #[test]
    fn root_and_nested_existing_paths_are_inside() {
        let (_guard, root) = workspace();
        fs::write(root.join("sub/a.md"), b"x").unwrap();

        assert!(ensure_within(&root, &root).is_ok());
        assert!(ensure_within(&root, &root.join("sub")).is_ok());
        assert!(ensure_within(&root, &root.join("sub/a.md")).is_ok());
    }

    #[test]
    fn not_yet_existing_target_inside_the_root_is_accepted() {
        let (_guard, root) = workspace();

        assert!(ensure_within(&root, &root.join("sub/new.md")).is_ok());
        assert!(ensure_within(&root, &root.join("missing/deeper/new.md")).is_ok());
    }

    #[test]
    fn parent_dir_segments_cannot_escape_the_root() {
        let (guard, root) = workspace();
        fs::create_dir_all(guard.path().join("other")).unwrap();

        assert!(ensure_within(&root, &root.join("sub/../../other")).is_err());
        assert!(ensure_within(&root, &root.join("../other")).is_err());
        // `..` after a component that does not exist cannot be resolved.
        assert!(ensure_within(&root, &root.join("missing/../../other")).is_err());
    }

    #[test]
    fn parent_dir_segments_that_stay_inside_are_accepted() {
        let (_guard, root) = workspace();

        assert!(ensure_within(&root, &root.join("sub/../sub/a.md")).is_ok());
    }

    #[test]
    fn sibling_with_a_shared_name_prefix_is_outside() {
        let (guard, root) = workspace();
        fs::create_dir_all(guard.path().join("ws2")).unwrap();

        assert!(ensure_within(&root, &guard.path().join("ws2")).is_err());
    }

    #[test]
    fn missing_root_is_an_error() {
        let (guard, _root) = workspace();

        assert!(ensure_within(&guard.path().join("nope"), &guard.path().join("nope/a")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_pointing_outside_is_refused_but_removable_as_an_entry() {
        let (guard, root) = workspace();
        let outside = guard.path().join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.md"), b"s").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();

        assert!(ensure_within(&root, &root.join("link")).is_err());
        assert!(ensure_within(&root, &root.join("link/secret.md")).is_err());
        assert!(ensure_within(&root, &root.join("link/new.md")).is_err());

        // Deleting or renaming the link itself is fine: the entry is inside.
        let entry = ensure_entry_within(&root, &root.join("link")).unwrap();
        assert!(entry.starts_with(root.canonicalize().unwrap()));
        // But anything reached *through* the link is not.
        assert!(ensure_entry_within(&root, &root.join("link/secret.md")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn dangling_symlink_is_refused() {
        let (guard, root) = workspace();
        std::os::unix::fs::symlink(guard.path().join("nowhere"), root.join("dangling")).unwrap();

        assert!(ensure_within(&root, &root.join("dangling")).is_err());
    }

    #[test]
    fn entry_check_rejects_paths_without_a_file_name() {
        let (_guard, root) = workspace();

        assert!(ensure_entry_within(&root, &root.join("sub/..")).is_err());
    }

    #[test]
    fn root_protection_survives_dot_segments() {
        let (_guard, root) = workspace();
        let canonical = canonical_root_of(&root).unwrap();

        assert_eq!(
            ensure_entry_within(&root, &root.join(".")).unwrap(),
            canonical
        );
        assert_eq!(
            ensure_entry_within(&root, &root.join("sub/../")).unwrap_err(),
            outside_workspace(),
        );
    }

    #[test]
    fn version_control_directories_are_protected() {
        assert!(is_protected_path(Path::new(".git/config")));
        assert!(is_protected_path(Path::new("docs/.GIT/HEAD")));
        assert!(is_protected_path(Path::new(".ssh/id_ed25519")));
        assert!(!is_protected_path(Path::new("docs/.gitignore")));
        assert!(!is_protected_path(Path::new("docs/readme.md")));
    }

    #[test]
    fn atomic_write_creates_and_replaces_without_leftovers() {
        let (_guard, root) = workspace();
        let path = root.join("a.md");

        atomic_write(&path, b"one").unwrap();
        atomic_write(&path, b"two").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "two");
        let leftovers: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp file left behind: {leftovers:?}");
    }

    #[test]
    fn atomic_write_fails_cleanly_when_the_directory_is_missing() {
        let (_guard, root) = workspace();

        assert!(atomic_write(&root.join("missing/a.md"), b"x").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_updates_the_symlink_target_and_keeps_the_link() {
        let (_guard, root) = workspace();
        let real = root.join("real.md");
        let link = root.join("link.md");
        fs::write(&real, b"old").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        atomic_write(&link, b"new").unwrap();

        assert_eq!(fs::read_to_string(&real).unwrap(), "new");
        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn atomic_write_preserves_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let (_guard, root) = workspace();
        let path = root.join("a.md");
        fs::write(&path, b"old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();

        atomic_write(&path, b"new").unwrap();

        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o640);
    }
}
