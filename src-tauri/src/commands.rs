use crate::app_manager;
use crate::config::{AgentConfig, AppConfig, AppInfo, SlotConfig};
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn get_installed_apps() -> Vec<AppInfo> {
    app_manager::list_installed_apps()
}

#[tauri::command]
pub fn get_running_apps() -> Vec<AppInfo> {
    app_manager::list_running_apps()
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

#[tauri::command]
pub fn get_agent_config(app_handle: tauri::AppHandle) -> AgentConfig {
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");

    store
        .get("agent_config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_agent_config(app_handle: tauri::AppHandle, config: AgentConfig) -> AgentConfig {
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");

    store.set("agent_config", serde_json::to_value(&config).unwrap());
    config
}

#[tauri::command]
pub fn run_agent_query(
    app_handle: tauri::AppHandle,
    agent_id: String,
    prompt: String,
    cwd: String,
) -> Result<(), String> {
    let store = app_handle
        .store("config.json")
        .expect("failed to access store");

    let config: AgentConfig = store
        .get("agent_config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let agent = config
        .agents
        .iter()
        .find(|a| a.id == agent_id)
        .ok_or_else(|| format!("Unknown agent: {}", agent_id))?;

    let resolved_cwd = app_manager::expand_and_validate_cwd(&cwd, &config.default_cwd);

    app_manager::run_agent_in_ghostty(
        &agent.program,
        &agent.args_before,
        &prompt,
        &resolved_cwd,
        config.use_cd_fallback,
    )
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
pub fn run_shell_command(command: String, cwd: String) -> Result<(), String> {
    let resolved_cwd = app_manager::expand_and_validate_cwd(&cwd, "~");
    app_manager::run_shell_in_ghostty(&command, &resolved_cwd)
}
