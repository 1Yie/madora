//! Poison-tolerant locking.
//!
//! Every mutex in this crate guards plain data — a cache, a registry, a set of
//! settings — so a panic while one is held cannot leave a half-written value
//! behind. Recovering the guard keeps a single panic from permanently breaking
//! every later call.

use std::sync::{Mutex, MutexGuard};

/// Locks `mutex`, ignoring poisoning.
pub(crate) fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn returns_the_guard_after_another_thread_poisoned_the_mutex() {
        let mutex = Arc::new(Mutex::new(7));
        let poisoner = Arc::clone(&mutex);

        let _ = std::thread::spawn(move || {
            let _guard = poisoner.lock().unwrap();
            panic!("poison the mutex");
        })
        .join();

        assert!(mutex.is_poisoned());
        assert_eq!(*lock_unpoisoned(&mutex), 7);
    }
}
