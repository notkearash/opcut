mod app_manager;
mod commands;
mod config;

use config::SlotConfig;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Emitter, Manager, PhysicalPosition,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
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

/// Place the window horizontally centered, with its top edge at ~1/4 of the screen height
/// (Spotlight-style upper-third). Top-anchored so the window can grow downward without
/// needing to reposition when results change.
fn position_centered_upper_third(window: &tauri::WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(mon) = monitor else {
        return;
    };
    let mpos = mon.position();
    let msize = mon.size();
    let Ok(ws) = window.outer_size() else {
        return;
    };
    let x = mpos.x + (msize.width as i32 - ws.width as i32) / 2;
    let y = mpos.y + (msize.height as i32) / 4;
    let _ = window.set_position(PhysicalPosition::new(x.max(mpos.x), y.max(mpos.y)));
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        position_centered_upper_third(&window);
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
    let toggle: Shortcut = "Alt+Space".parse()?;
    let h0 = app.clone();
    let held0 = Arc::new(AtomicBool::new(false));
    app.global_shortcut()
        .on_shortcut(toggle, move |_app, _shortcut, event| match event.state() {
            ShortcutState::Pressed => {
                if held0.swap(true, Ordering::SeqCst) {
                    return;
                }
                toggle_main_window(&h0);
            }
            ShortcutState::Released => {
                held0.store(false, Ordering::SeqCst);
            }
        })?;

    let shortcut_keys = [
        "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9",
    ];

    for (i, key) in shortcut_keys.iter().enumerate() {
        let shortcut: Shortcut = key.parse()?;
        let h = app.clone();
        let held = Arc::new(AtomicBool::new(false));
        app.global_shortcut()
            .on_shortcut(shortcut, move |_app, _shortcut, event| match event.state() {
                ShortcutState::Pressed => {
                    if held.swap(true, Ordering::SeqCst) {
                        return;
                    }
                    // Window open → ⌥N assigns that slot; window hidden → ⌥N launches it.
                    let visible = h
                        .get_webview_window("main")
                        .and_then(|w| w.is_visible().ok())
                        .unwrap_or(false);
                    if visible {
                        let _ = h.emit("assign-slot", i);
                    } else {
                        launch_slot(&h, i);
                    }
                }
                ShortcutState::Released => {
                    held.store(false, Ordering::SeqCst);
                }
            })?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_installed_apps,
            commands::get_slot_config,
            commands::set_slot_config,
            commands::launch_or_focus_app,
            commands::get_agent_config,
            commands::set_agent_config,
            commands::run_agent_query,
            commands::run_shell_command,
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
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        toggle_main_window(tray.app_handle());
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
