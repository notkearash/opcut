mod app_manager;
mod commands;
mod config;

use config::SlotConfig;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_positioner::{Position, WindowExt as PosWindowExt};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
fn apply_macos_window_behavior(app: &AppHandle) {
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };
    if ns_window_ptr.is_null() {
        return;
    }
    unsafe {
        let ns_window: &NSWindow = &*(ns_window_ptr as *mut AnyObject as *mut NSWindow);
        let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary;
        ns_window.setCollectionBehavior(behavior);
    }
}

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

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.move_window(Position::TrayCenter);
    let _ = window.show();
    let _ = window.set_focus();
}

fn is_main_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
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
    let toggle: Shortcut = "Alt+0".parse()?;
    let h0 = app.clone();
    app.global_shortcut()
        .on_shortcut(toggle, move |_app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            toggle_main_window(&h0);
        })?;

    let shortcut_keys = [
        "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9",
    ];

    for (i, key) in shortcut_keys.iter().enumerate() {
        let shortcut: Shortcut = key.parse()?;
        let h = app.clone();
        app.global_shortcut()
            .on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if is_main_visible(&h) {
                    show_main_window(&h);
                    let _ = h.emit("open-picker", i);
                } else {
                    launch_slot(&h, i);
                }
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

            #[cfg(target_os = "macos")]
            apply_macos_window_behavior(app.handle());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
