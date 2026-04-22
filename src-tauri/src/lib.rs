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
use std::sync::{Arc, Mutex};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

struct TrayRect(Mutex<Option<(f64, f64, f64, f64)>>);

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

fn position_near_tray(app: &AppHandle, window: &tauri::WebviewWindow) {
    let tray_rect = app
        .state::<TrayRect>()
        .0
        .lock()
        .ok()
        .and_then(|g| *g);
    let Some((tx, ty, tw, _th)) = tray_rect else {
        return;
    };
    let Ok(ws) = window.outer_size() else {
        return;
    };
    let x = tx + tw / 2.0 - ws.width as f64 / 2.0;
    let y = ty;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        position_near_tray(app, &window);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    position_near_tray(app, &window);
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
                    if is_main_visible(&h) {
                        show_main_window(&h);
                        let _ = h.emit("open-picker", i);
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
        ])
        .setup(|app| {
            app.set_activation_policy(ActivationPolicy::Accessory);
            app.manage(TrayRect(Mutex::new(None)));

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
                    let rect = match &event {
                        TrayIconEvent::Click { rect, .. }
                        | TrayIconEvent::Enter { rect, .. }
                        | TrayIconEvent::Leave { rect, .. }
                        | TrayIconEvent::Move { rect, .. } => Some(rect.clone()),
                        _ => None,
                    };
                    if let Some(rect) = rect {
                        let pos = rect.position.to_physical::<f64>(1.0);
                        let size = rect.size.to_physical::<f64>(1.0);
                        if let Ok(mut g) = app.state::<TrayRect>().0.lock() {
                            *g = Some((pos.x, pos.y, size.width, size.height));
                        }
                    }

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
