//! Crash-recovery snapshots stored under `app_data_dir()/recovery/session.json`.
//! The frontend owns the JSON schema; Rust only persists the latest snapshot.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

use crate::commands::files::atomic_write_with;
use crate::error::AppError;

const RECOVERY_DIR: &str = "recovery";
const RECOVERY_FILE: &str = "session.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub json: String,
    pub saved_at: String,
}

pub(crate) fn recovery_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(RECOVERY_DIR)
}

pub(crate) fn recovery_path(app_data_dir: &Path) -> PathBuf {
    recovery_dir(app_data_dir).join(RECOVERY_FILE)
}

fn snapshot_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| AppError::Io(format!("app data directory unavailable: {err}")))?;
    Ok(recovery_path(&app_data_dir))
}

fn write_snapshot(path: &Path, json: &str) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| AppError::Io(format!("recovery folder: {err}")))?;
    }
    atomic_write_with(path, |file| {
        use std::io::Write as _;
        file.write_all(json.as_bytes())
    })
    .map_err(|err| AppError::Io(format!("recovery snapshot: {err}")))
}

fn read_snapshot(path: &Path) -> Result<Option<RecoverySnapshot>, AppError> {
    if !path.is_file() {
        return Ok(None);
    }
    let json = fs::read_to_string(path)
        .map_err(|err| AppError::Io(format!("recovery snapshot: {err}")))?;
    let saved_at = fs::metadata(path)
        .and_then(|meta| meta.modified())
        .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339())
        .unwrap_or_default();
    Ok(Some(RecoverySnapshot { json, saved_at }))
}

fn clear_snapshot(path: &Path) -> Result<(), AppError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(AppError::Io(format!("recovery snapshot: {err}"))),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn recovery_write(app: tauri::AppHandle, json: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = snapshot_path(&app)?;
        write_snapshot(&path, &json)
    })
    .await
    .map_err(|err| AppError::Io(format!("recovery task failed: {err}")))?
}

#[tauri::command]
#[specta::specta]
pub async fn recovery_read(app: tauri::AppHandle) -> Result<Option<RecoverySnapshot>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = snapshot_path(&app)?;
        read_snapshot(&path)
    })
    .await
    .map_err(|err| AppError::Io(format!("recovery task failed: {err}")))?
}

#[tauri::command]
#[specta::specta]
pub async fn recovery_clear(app: tauri::AppHandle) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = snapshot_path(&app)?;
        clear_snapshot(&path)
    })
    .await
    .map_err(|err| AppError::Io(format!("recovery task failed: {err}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_paths_live_under_app_data() {
        let base = Path::new("C:/Users/test/AppData/Roaming/io.github.fahmiau.xlsformstudio");
        assert_eq!(recovery_dir(base), base.join("recovery"));
        assert_eq!(recovery_path(base), base.join("recovery/session.json"));
    }

    #[test]
    fn write_read_clear_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = recovery_path(dir.path());

        assert_eq!(read_snapshot(&path).unwrap(), None);
        write_snapshot(&path, r#"{"hello":"world"}"#).unwrap();
        let snapshot = read_snapshot(&path).unwrap().expect("snapshot exists");
        assert_eq!(snapshot.json, r#"{"hello":"world"}"#);
        assert!(!snapshot.saved_at.is_empty());

        clear_snapshot(&path).unwrap();
        assert_eq!(read_snapshot(&path).unwrap(), None);
        // Clearing a missing snapshot is a no-op.
        clear_snapshot(&path).unwrap();
    }

    #[test]
    fn write_replaces_previous_snapshot_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = recovery_path(dir.path().join("app").as_path());
        write_snapshot(&path, "one").unwrap();
        write_snapshot(&path, "two").unwrap();
        assert_eq!(read_snapshot(&path).unwrap().unwrap().json, "two");
    }
}
