//! Application error type shared across IPC. Every variant is serializable and
//! exported to TypeScript through Specta (AD-7).

use serde::Serialize;

/// Errors returned by application commands.
///
/// `detail` stays human readable: the UI maps `kind` to friendly copy and may
/// show `detail` in a collapsible section. Never include secrets or workbook
/// contents in `detail`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type, thiserror::Error)]
#[serde(tag = "kind", content = "detail")]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(String),

    #[error("file is open in another program: {0}")]
    FileLocked(String),

    #[error("file not found: {0}")]
    NotFound(String),

    #[error("invalid path: {0}")]
    InvalidPath(String),

    #[error("credential store error: {0}")]
    Keyring(String),

    #[error("network error: {0}")]
    Network(String),

    #[error("provider error: {0}")]
    Provider(String),

    #[error("window error: {0}")]
    Window(String),
}

impl AppError {
    pub fn io(err: impl std::fmt::Display) -> Self {
        Self::Io(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_with_kind_and_detail() {
        let value = serde_json::to_value(AppError::FileLocked("C:/form.xlsx".into())).unwrap();
        assert_eq!(value["kind"], "FileLocked");
        assert_eq!(value["detail"], "C:/form.xlsx");
    }

    #[test]
    fn serializes_the_window_variant() {
        let value = serde_json::to_value(AppError::Window("zoom out of range: 3".into())).unwrap();
        assert_eq!(value["kind"], "Window");
        assert_eq!(value["detail"], "zoom out of range: 3");
    }
}
