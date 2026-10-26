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
            commands::secrets::secret_set,
            commands::secrets::secret_status,
            commands::secrets::secret_delete,
            commands::ai_proxy::ai_proxy,
            commands::ai_proxy::ai_proxy_cancel,
        ])
        .events(tauri_specta::collect_events![])
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
}

/// WebView2 handles Ctrl+R, F5 and the other browser accelerators itself before
/// the page sees the keydown, so `preventDefault` in the frontend cannot stop a
/// reload. Disable them at the WebView2 level (Task 1.10); the app owns those
/// keys through `src/lib/shortcuts.ts`.
#[cfg(windows)]
fn lock_down_browser_accelerators(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;

    let _ = window.with_webview(|webview| {
        let Ok(core) = (unsafe { webview.controller().CoreWebView2() }) else {
            return;
        };
        let Ok(settings) = (unsafe { core.Settings() }) else {
            return;
        };
        let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() else {
            return;
        };
        let _ = unsafe { settings.SetAreBrowserAcceleratorKeysEnabled(false) };
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta = specta_builder();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Q-AI1: "Get a key" / billing links open in the system browser. The
        // capability allows exact URLs only; no file/path opening.
        .plugin(tauri_plugin_opener::init())
        .manage(
            commands::ai_proxy::AiProxyState::new()
                .expect("failed to initialize the AI proxy HTTP client"),
        );

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
            let Some(window) = app.get_webview_window("main") else {
                return Err("main window is not configured".into());
            };
            #[cfg(windows)]
            lock_down_browser_accelerators(&window);
            #[cfg(not(windows))]
            let _ = window;
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
