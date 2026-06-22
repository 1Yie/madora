use std::{path::PathBuf, sync::OnceLock};

use git2::{Cred, Error, RemoteCallbacks, Repository};
use keyring_core::{Entry, Error as KeyringError};
use tauri::{AppHandle, Manager};

use crate::i18n;
use crate::models::git::{GitAuth, GitCredentials};

use super::error::{GitResult, GitServiceError};

const GIT_CREDENTIALS_SERVICE: &str = "madora.git";
const GIT_CREDENTIALS_ACCOUNT: &str = "credentials";
const LEGACY_CREDENTIALS_FILENAME: &str = "git_credentials.json";

static SECURE_STORE_INIT: OnceLock<Result<(), String>> = OnceLock::new();

pub(crate) fn build_remote_callbacks<'a>(
    repo: &'a Repository,
    auth: Option<&'a GitAuth>,
) -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();

    callbacks.credentials(move |url, username_from_url, allowed_types| {
        if allowed_types.is_ssh_key() {
            let ssh_username = auth
                .and_then(|value| value.ssh_username.as_deref())
                .or(username_from_url)
                .unwrap_or("git");

            if let Some(private_key_path) =
                auth.and_then(|value| value.ssh_private_key_path.as_deref())
            {
                return Cred::ssh_key(
                    ssh_username,
                    None,
                    std::path::Path::new(private_key_path),
                    auth.and_then(|value| value.ssh_passphrase.as_deref()),
                );
            }

            let has_ssh_sock = std::env::var("SSH_AUTH_SOCK")
                .map(|sock| std::path::Path::new(&sock).exists())
                .unwrap_or(false);

            if has_ssh_sock {
                if let Some(username) = username_from_url {
                    if let Ok(cred) = Cred::ssh_key_from_agent(username) {
                        return Ok(cred);
                    }
                }

                if let Ok(cred) = Cred::ssh_key_from_agent(ssh_username) {
                    return Ok(cred);
                }
            }
        }

        if allowed_types.is_user_pass_plaintext() {
            if let Some(auth) = auth {
                let password = auth.password.as_deref().unwrap_or_default();
                let username = auth
                    .username
                    .as_deref()
                    .or(username_from_url)
                    .unwrap_or("git");

                if !password.is_empty() {
                    return Cred::userpass_plaintext(username, password);
                }
            }

            if let Ok(config) = repo.config() {
                if let Ok(cred) = Cred::credential_helper(&config, url, username_from_url) {
                    return Ok(cred);
                }
            }
        }

        if allowed_types.is_username() {
            if let Some(username) = auth
                .and_then(|value| value.username.as_deref())
                .or(username_from_url)
            {
                return Cred::username(username);
            }
        }

        Err(Error::from_str(&i18n::t("git.auth_failed_str")))
    });

    callbacks
}

pub(crate) fn store_credentials(
    app_handle: &AppHandle,
    credentials: &GitCredentials,
) -> GitResult<()> {
    let entry = credentials_entry()?;

    if credentials_are_empty(credentials) {
        delete_credentials_entry(&entry)?;
        delete_legacy_credentials_file(app_handle)?;
        return Ok(());
    }

    let json = serde_json::to_string(credentials)?;
    entry.set_password(&json).map_err(|error| {
        GitServiceError::message(i18n::tf(
            "git.save_credentials_failed",
            &[("error", &error.to_string())],
        ))
    })?;
    delete_legacy_credentials_file(app_handle)?;
    Ok(())
}

pub(crate) fn load_credentials(app_handle: &AppHandle) -> GitResult<GitCredentials> {
    let entry = credentials_entry()?;

    match entry.get_password() {
        Ok(json) => deserialize_credentials(&json),
        Err(KeyringError::NoEntry) => migrate_legacy_credentials(app_handle, &entry),
        Err(error) => Err(GitServiceError::message(i18n::tf(
            "git.read_credentials_failed",
            &[("error", &error.to_string())],
        ))),
    }
}

fn ensure_secure_store() -> GitResult<()> {
    SECURE_STORE_INIT
        .get_or_init(|| {
            #[cfg(target_os = "linux")]
            let use_secret_service = true;
            #[cfg(not(target_os = "linux"))]
            let use_secret_service = false;

            keyring::use_native_store(use_secret_service).map_err(|error| {
                #[cfg(target_os = "linux")]
                {
                    i18n::tf(
                        "git.keyring_access_failed",
                        &[("error", &error.to_string())],
                    )
                }
                #[cfg(not(target_os = "linux"))]
                {
                    i18n::tf(
                        "git.keyring_access_failed",
                        &[("error", &error.to_string())],
                    )
                }
            })
        })
        .clone()
        .map_err(Into::into)
}

fn credentials_entry() -> GitResult<Entry> {
    ensure_secure_store()?;
    Entry::new(GIT_CREDENTIALS_SERVICE, GIT_CREDENTIALS_ACCOUNT).map_err(|error| {
        GitServiceError::message(i18n::tf(
            "git.keyring_entry_init_failed",
            &[("error", &error.to_string())],
        ))
    })
}

fn migrate_legacy_credentials(app_handle: &AppHandle, entry: &Entry) -> GitResult<GitCredentials> {
    let Some(credentials) = read_legacy_credentials(app_handle)? else {
        return Ok(GitCredentials::default());
    };

    if !credentials_are_empty(&credentials) {
        let json = serde_json::to_string(&credentials)?;
        entry.set_password(&json).map_err(|error| {
            GitServiceError::message(i18n::tf(
                "git.migrate_credentials_failed",
                &[("error", &error.to_string())],
            ))
        })?;
    }

    delete_legacy_credentials_file(app_handle)?;
    Ok(credentials)
}

fn deserialize_credentials(json: &str) -> GitResult<GitCredentials> {
    serde_json::from_str(json).map_err(|error| {
        GitServiceError::message(i18n::tf(
            "git.parse_credentials_failed",
            &[("error", &error.to_string())],
        ))
    })
}

fn delete_credentials_entry(entry: &Entry) -> GitResult<()> {
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(GitServiceError::message(i18n::tf(
            "git.delete_credentials_failed",
            &[("error", &error.to_string())],
        ))),
    }
}

fn credentials_are_empty(credentials: &GitCredentials) -> bool {
    credentials.auth_username.trim().is_empty()
        && credentials.auth_password.trim().is_empty()
        && credentials.ssh_username.trim().is_empty()
        && credentials.ssh_private_key_path.trim().is_empty()
        && credentials.ssh_passphrase.trim().is_empty()
}

fn read_legacy_credentials(app_handle: &AppHandle) -> GitResult<Option<GitCredentials>> {
    let path = legacy_credentials_path(app_handle)?;
    match std::fs::read_to_string(&path) {
        Ok(json) => deserialize_credentials(&json).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(GitServiceError::message(i18n::tf(
            "git.read_legacy_credentials_failed",
            &[("error", &error.to_string())],
        ))),
    }
}

fn delete_legacy_credentials_file(app_handle: &AppHandle) -> GitResult<()> {
    let path = legacy_credentials_path(app_handle)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(GitServiceError::message(i18n::tf(
            "git.delete_legacy_credentials_failed",
            &[("error", &error.to_string())],
        ))),
    }
}

fn legacy_credentials_path(app_handle: &AppHandle) -> GitResult<PathBuf> {
    let data_dir = app_handle.path().app_data_dir().map_err(|error| {
        GitServiceError::message(i18n::tf(
            "git.cannot_get_app_data_dir",
            &[("error", &error.to_string())],
        ))
    })?;
    std::fs::create_dir_all(&data_dir)?;
    Ok(data_dir.join(LEGACY_CREDENTIALS_FILENAME))
}
