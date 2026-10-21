use serde::Serialize;

use crate::error::AppError;

/// Smoke command proving the Specta surface end to end (Task 1.2).
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub platform: String,
    pub arch: String,
}

#[tauri::command]
#[specta::specta]
pub fn app_info(app: tauri::AppHandle) -> Result<AppInfo, AppError> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
}
