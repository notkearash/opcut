mod app_manager;
mod commands;
mod config;

use config::SlotConfig;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_positioner::{Position, WindowExt as PosWindowExt};
use tauri_plugin_store::StoreExt;

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.move_window(Position::TrayCenter);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn launch_slot(app: &AppHandle, slot_index: usize) {
    let store = app.store("config.json").expect("failed to access store");
    let config: SlotConfig = store
        .get("slot_config")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    if let Some(app_config) = &config.slots[slot_index] {
        let _ = app_manager::launch_or_focus_app(&app_config.path);
    }
}

fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut_keys = [
        "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9",
    ];

    for (i, key) in shortcut_keys.iter().enumerate() {
        let shortcut: Shortcut = key.parse()?;
        let h = app.clone();
        app.global_shortcut()
            .on_shortcut(shortcut, move |_app, _shortcut, _event| {
                launch_slot(&h, i);
            })?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_installed_apps,
            commands::get_slot_config,
            commands::set_slot_config,
            commands::launch_or_focus_app,
        ])
        .setup(|app| {
            app.set_activation_policy(ActivationPolicy::Accessory);

            let quit = MenuItem::with_id(app, "quit", "Quit opcut", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    tauri_plugin_positioner::on_tray_event(app, &event);

                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        toggle_main_window(app);
                    }
                })
                .build(app)?;

            register_shortcuts(app.handle())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
