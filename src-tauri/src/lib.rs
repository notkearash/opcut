mod app_manager;
mod commands;
mod config;

use config::SlotConfig;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Emitter, Manager, PhysicalPosition,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

/// Convert the main window's `NSWindow` into a non-activating `NSPanel` so the launcher
/// can float over another app's native-fullscreen Space without switching Spaces.
///
/// A regular `NSWindow` — even with `CanJoinAllSpaces | FullScreenAuxiliary` — can't draw
/// over a fullscreen app, because ordering it front requires activating this (Accessory) app,
/// which forces macOS to transition away from the fullscreen Space. A non-activating panel
/// can be ordered front without activating the app, so it appears in place. It still becomes
/// key (to receive keystrokes for the search field) without stealing app activation.
#[cfg(target_os = "macos")]
fn convert_main_to_panel(app: &AppHandle) {
    use tauri_nspanel::cocoa::appkit::NSWindowCollectionBehavior;
    use tauri_nspanel::WebviewWindowExt;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(panel) = window.to_panel() else {
        return;
    };

    // NSFloatingWindowLevel — high enough to sit above app windows.
    panel.set_level(4);

    // NSWindowStyleMaskNonActivatingPanel (1 << 7): showing the panel never activates the app.
    panel.set_style_mask(1 << 7);

    // Display on the active Space (including a fullscreen app's) and join all Spaces.
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );
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

#[cfg(target_os = "macos")]
fn toggle_main_window(app: &AppHandle) {
    use tauri_nspanel::ManagerExt;

    let Ok(panel) = app.get_webview_panel("main") else {
        return;
    };
    if panel.is_visible() {
        panel.order_out(None);
    } else {
        if let Some(window) = app.get_webview_window("main") {
            position_centered_upper_third(&window);
        }
        // Orders front (over fullscreen) and makes key for keyboard input, without activating the app.
        panel.show();
    }
}

#[cfg(not(target_os = "macos"))]
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

/// Whether the launcher is currently on screen. On macOS the window is an `NSPanel`, so its
/// visibility is tracked on the panel rather than the Tauri window handle.
fn main_window_visible(app: &AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        return app
            .get_webview_panel("main")
            .map(|p| p.is_visible())
            .unwrap_or(false);
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.get_webview_window("main")
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false)
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

const SLOT_SHORTCUT_KEYS: [&str; 9] = [
    "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9",
];

/// Whether the ⌥1–9 quick-slot shortcuts are enabled (stored flag, default on).
pub(crate) fn slot_shortcuts_enabled(app: &AppHandle) -> bool {
    let store = app.store("config.json").expect("failed to access store");
    store
        .get("slot_shortcuts_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Register the always-on ⌥Space launcher toggle.
fn register_toggle_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
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
    Ok(())
}

/// Register the ⌥1–9 quick-slot shortcuts.
pub(crate) fn register_slot_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    for (i, key) in SLOT_SHORTCUT_KEYS.iter().enumerate() {
        let shortcut: Shortcut = key.parse()?;
        let h = app.clone();
        let held = Arc::new(AtomicBool::new(false));
        app.global_shortcut()
            .on_shortcut(shortcut, move |_app, _shortcut, event| {
                match event.state() {
                    ShortcutState::Pressed => {
                        if held.swap(true, Ordering::SeqCst) {
                            return;
                        }
                        // Window open → ⌥N assigns that slot; window hidden → ⌥N launches it.
                        let visible = main_window_visible(&h);
                        if visible {
                            let _ = h.emit("assign-slot", i);
                        } else {
                            launch_slot(&h, i);
                        }
                    }
                    ShortcutState::Released => {
                        held.store(false, Ordering::SeqCst);
                    }
                }
            })?;
    }
    Ok(())
}

/// Unregister the ⌥1–9 quick-slot shortcuts, releasing them back to the system.
pub(crate) fn unregister_slot_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    for key in SLOT_SHORTCUT_KEYS.iter() {
        let shortcut: Shortcut = key.parse()?;
        app.global_shortcut().unregister(shortcut)?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .invoke_handler(tauri::generate_handler![
            commands::get_installed_apps,
            commands::get_running_apps,
            commands::get_slot_config,
            commands::set_slot_config,
            commands::launch_or_focus_app,
            commands::terminate_running_app,
            commands::get_agent_config,
            commands::set_agent_config,
            commands::run_agent_query,
            commands::run_shell_command,
            commands::get_slot_shortcuts_enabled,
            commands::set_slot_shortcuts_enabled,
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

            register_toggle_shortcut(app.handle())?;
            if slot_shortcuts_enabled(app.handle()) {
                register_slot_shortcuts(app.handle())?;
            }

            #[cfg(target_os = "macos")]
            convert_main_to_panel(app.handle());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
