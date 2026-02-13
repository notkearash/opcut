use crate::app_manager;
use crate::config::{AppConfig, AppInfo, SlotConfig};
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn get_installed_apps() -> Vec<AppInfo> {
    app_manager::list_installed_apps()
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
