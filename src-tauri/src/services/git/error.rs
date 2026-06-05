use std::fmt;

use git2::{Error, ErrorCode};

#[derive(Debug)]
pub enum GitServiceError {
    Git(Error),
    Message(String),
}

pub type GitResult<T> = Result<T, GitServiceError>;

impl GitServiceError {
    pub fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }

    pub fn code(&self) -> Option<ErrorCode> {
        match self {
            Self::Git(error) => Some(error.code()),
            Self::Message(_) => None,
        }
    }
}

impl fmt::Display for GitServiceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Git(error) => f.write_str(error.message()),
            Self::Message(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for GitServiceError {}

impl From<Error> for GitServiceError {
    fn from(value: Error) -> Self {
        Self::Git(value)
    }
}

impl From<String> for GitServiceError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for GitServiceError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}

impl From<std::io::Error> for GitServiceError {
    fn from(value: std::io::Error) -> Self {
        Self::Message(value.to_string())
    }
}

impl From<serde_json::Error> for GitServiceError {
    fn from(value: serde_json::Error) -> Self {
        Self::Message(value.to_string())
    }
}
