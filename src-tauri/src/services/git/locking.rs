use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, OnceLock},
};

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

static REPO_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<AsyncMutex<()>>>>> = OnceLock::new();

pub(crate) struct RepoLockGuard {
    _guard: OwnedMutexGuard<()>,
}

pub(crate) async fn acquire_repo_lock(root_path: &Path) -> RepoLockGuard {
    let key = lock_key(root_path);
    let lock = {
        let mut registry = lock_unpoisoned(lock_registry());
        registry
            .entry(key)
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    };

    RepoLockGuard {
        _guard: lock.lock_owned().await,
    }
}

fn lock_registry() -> &'static Mutex<HashMap<PathBuf, Arc<AsyncMutex<()>>>> {
    REPO_LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn lock_key(root_path: &Path) -> PathBuf {
    std::fs::canonicalize(root_path).unwrap_or_else(|_| root_path.to_path_buf())
}
