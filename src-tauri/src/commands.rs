use crate::app_manager;
use crate::config::{AppConfig, AppInfo, ShellConfig, SlotConfig};
use crate::icons;
use std::collections::HashMap;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn get_installed_apps() -> Vec<AppInfo> {
    app_manager::list_installed_apps()
}

#[tauri::command]
pub fn get_running_apps() -> Vec<AppInfo> {
    app_manager::list_running_apps()
}

/// PNG data URIs for the given bundle paths. `async` on purpose: rasterizing an icon costs
/// ~15ms, so this runs on the async runtime instead of blocking the main thread (and thus
/// the panel) while a screenful of icons is produced. Results are memoized per path.
#[tauri::command]
pub async fn get_app_icons(paths: Vec<String>) -> HashMap<String, String> {
    icons::icons_for_paths(&paths)
}

#[tauri::command]
pub fn get_icons_enabled(app_handle: tauri::AppHandle) -> bool {
    crate::icons_enabled(&app_handle)
}

#[tauri::command]
pub fn set_icons_enabled(app_handle: tauri::AppHandle, enabled: bool) -> bool {
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");
    store.set("icons_enabled", serde_json::json!(enabled));
    enabled
}

#[tauri::command]
pub fn get_slot_config(app_handle: tauri::AppHandle) -> SlotConfig {
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");

    store
        .get("slot_config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_slot_config(
    app_handle: tauri::AppHandle,
    slot_index: usize,
    app_config: Option<AppConfig>,
) -> SlotConfig {
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");

    let mut config: SlotConfig = store
        .get("slot_config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    if slot_index < 9 {
        config.slots[slot_index] = app_config;
    }

    store.set("slot_config", serde_json::to_value(&config).unwrap());

    config
}

#[tauri::command]
pub fn launch_or_focus_app(path: String) -> Result<(), String> {
    app_manager::launch_or_focus_app(&path)
}

#[tauri::command]
pub fn terminate_running_app(path: String) -> Result<(), String> {
    app_manager::terminate_running_app(&path)
}

/// The directory `!` commands run in by default.
#[tauri::command]
pub fn get_shell_cwd(app_handle: tauri::AppHandle) -> String {
    crate::shell_cwd(&app_handle)
}

/// Persist the default shell directory. `path` is tilde-expanded and checked, so the
/// returned value is always a directory that exists — echo it back so the UI can show
/// what was actually saved when the typed path didn't resolve.
#[tauri::command]
pub fn set_shell_cwd(app_handle: tauri::AppHandle, path: String) -> String {
    let resolved = app_manager::expand_and_validate_cwd(&path, "~");
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");
    store.set(
        "shell_config",
        serde_json::to_value(&ShellConfig {
            cwd: resolved.clone(),
        })
        .unwrap(),
    );
    resolved
}

#[tauri::command]
pub fn get_slot_shortcuts_enabled(app_handle: tauri::AppHandle) -> bool {
    crate::slot_shortcuts_enabled(&app_handle)
}

#[tauri::command]
pub fn set_slot_shortcuts_enabled(
    app_handle: tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");
    store.set("slot_shortcuts_enabled", serde_json::json!(enabled));

    if enabled {
        crate::register_slot_shortcuts(&app_handle).map_err(|e| e.to_string())?;
    } else {
        crate::unregister_slot_shortcuts(&app_handle).map_err(|e| e.to_string())?;
    }
    Ok(enabled)
}

#[tauri::command]
pub fn get_three_finger_app_switcher_enabled(app_handle: tauri::AppHandle) -> bool {
    crate::gesture::enabled(&app_handle)
}

#[tauri::command]
pub fn set_three_finger_app_switcher_enabled(
    app_handle: tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    crate::gesture::set_enabled(&app_handle, enabled)
}

/// `/` pressed during an ⌥Tab hold: releasing Option must no longer switch apps.
#[tauri::command]
pub fn switcher_enter_search() {
    crate::switcher::enter_search();
}

/// The panel hid or the webview otherwise ended the ⌥Tab session.
#[tauri::command]
pub fn switcher_cancel() {
    crate::switcher::cancel();
}

#[tauri::command]
pub fn run_shell_command(
    app_handle: tauri::AppHandle,
    command: String,
    cwd: String,
) -> Result<(), String> {
    let fallback = crate::shell_cwd(&app_handle);
    let resolved_cwd = app_manager::expand_and_validate_cwd(&cwd, &fallback);
    app_manager::run_shell_in_ghostty(&command, &resolved_cwd)
}
