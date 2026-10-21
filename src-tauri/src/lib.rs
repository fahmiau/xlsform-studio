//! Library entry point: builder, plugins, and the single Specta-registered
//! invoke handler (AD-7). Keep this file thin; commands live in `commands/`.

mod commands;
mod error;

use tauri::Manager;

pub use error::AppError;

/// Tauri Specta bindings for every application command and event.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            commands::app_info::app_info,
            commands::files::read_workbook,
            commands::files::save_workbook,
            commands::recovery::recovery_write,
            commands::recovery::recovery_read,
            commands::recovery::recovery_clear,
        ])
        .events(tauri_specta::collect_events![])
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta = specta_builder();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(all(debug_assertions, feature = "agent-kit"))]
    let builder = builder.plugin(tauri_plugin_agent_kit::init(
        tauri_plugin_agent_kit::Config {
            enabled: std::env::var_os("TAURI_AGENT_KIT").is_some(),
            advanced: false,
        },
    ));

    builder
        .invoke_handler(specta.invoke_handler())
        .setup(|app| {
            // The main window is declared in tauri.conf.json.
            if app.get_webview_window("main").is_none() {
                return Err("main window is not configured".into());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running xlsform-studio");
}

#[cfg(test)]
mod bindings_test {
    /// Regenerates `src/ipc/bindings.ts` from the Rust contract. CI runs this
    /// and fails on drift (AD-7).
    #[test]
    fn export_bindings() {
        crate::specta_builder()
            .export(
                specta_typescript::Typescript::default(),
                "../src/ipc/bindings.ts",
            )
            .expect("failed to export TypeScript bindings");
    }
}
