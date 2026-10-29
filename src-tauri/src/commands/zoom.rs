use tauri::Manager;

use crate::error::AppError;

/// Set the main webview zoom factor (`1.0` = 100%).
#[tauri::command]
#[specta::specta]
pub fn set_zoom(app: tauri::AppHandle, scale: f64) -> Result<(), AppError> {
    if !valid_zoom(scale) {
        return Err(AppError::Window(format!("zoom out of range: {scale}")));
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Window("main window not found".into()))?;
    window
        .set_zoom(scale)
        .map_err(|error| AppError::Window(error.to_string()))
}

fn valid_zoom(scale: f64) -> bool {
    (0.5..=2.0).contains(&scale)
}

#[cfg(test)]
mod tests {
    use super::valid_zoom;

    #[test]
    fn accepts_the_supported_range() {
        assert!(valid_zoom(0.5));
        assert!(valid_zoom(1.0));
        assert!(valid_zoom(2.0));
        assert!(!valid_zoom(0.49));
        assert!(!valid_zoom(2.01));
        assert!(!valid_zoom(f64::NAN));
    }
}
