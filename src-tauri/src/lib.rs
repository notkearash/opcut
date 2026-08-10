mod app_manager;
mod commands;
mod config;
mod gesture;
mod icons;
mod switcher;

use config::{ShellConfig, SlotConfig};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, Emitter, Manager, PhysicalPosition,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
const NS_FLOATING_WINDOW_LEVEL: i32 = 4;
#[cfg(target_os = "macos")]
const NS_WINDOW_STYLE_MASK_NON_ACTIVATING_PANEL: i32 = 1 << 7;

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

    panel.set_level(NS_FLOATING_WINDOW_LEVEL);
    panel.set_style_mask(NS_WINDOW_STYLE_MASK_NON_ACTIVATING_PANEL);
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );
}

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

fn show_panel(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;

        if let Some(window) = app.get_webview_window("main") {
            position_centered_upper_third(&window);
        }
        if let Ok(panel) = app.get_webview_panel("main") {
            panel.show();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app.get_webview_window("main") {
            position_centered_upper_third(&window);
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub(crate) fn show_running_apps(app: &AppHandle) {
    show_panel(app);
    let _ = app.emit("show-running-apps", ());
}

#[cfg(target_os = "macos")]
pub(crate) fn show_switcher(app: &AppHandle) {
    show_panel(app);
    let _ = app.emit("switcher-open", ());
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

const SLOT_SHORTCUT_KEYS: [&str; config::SLOT_COUNT] = [
    "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9",
];

pub(crate) fn slot_shortcuts_enabled(app: &AppHandle) -> bool {
    let store = app.store("config.json").expect("failed to access store");
    store
        .get("slot_shortcuts_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

pub(crate) fn shell_cwd(app: &AppHandle) -> String {
    let store = app.store("config.json").expect("failed to access store");
    store
        .get("shell_config")
        .and_then(|v| serde_json::from_value::<ShellConfig>(v).ok())
        .unwrap_or_default()
        .cwd
}

pub(crate) fn icons_enabled(app: &AppHandle) -> bool {
    let store = app.store("config.json").expect("failed to access store");
    store
        .get("icons_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

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

#[cfg(target_os = "macos")]
fn register_switcher_shortcuts(app: &AppHandle) {
    for (key, backward) in [("Alt+Tab", false), ("Shift+Alt+Tab", true)] {
        let shortcut: Shortcut = match key.parse() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("opcut: could not parse {key}: {e}");
                continue;
            }
        };
        let h = app.clone();
        let held = Arc::new(AtomicBool::new(false));
        let registered =
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    match event.state() {
                        ShortcutState::Pressed => {
                            let key_repeat = held.swap(true, Ordering::SeqCst);
                            if key_repeat {
                                return;
                            }
                            switcher::handle_tab(&h, backward);
                        }
                        ShortcutState::Released => {
                            held.store(false, Ordering::SeqCst);
                        }
                    }
                });
        if let Err(e) = registered {
            eprintln!("opcut: could not register {key}: {e}");
        }
    }
}

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
                        let launcher_is_open = main_window_visible(&h);
                        if launcher_is_open {
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
            commands::get_app_icons,
            commands::get_icons_enabled,
            commands::set_icons_enabled,
            commands::get_slot_config,
            commands::set_slot_config,
            commands::launch_or_focus_app,
            commands::terminate_running_app,
            commands::run_shell_command,
            commands::get_shell_cwd,
            commands::set_shell_cwd,
            commands::get_slot_shortcuts_enabled,
            commands::set_slot_shortcuts_enabled,
            commands::get_three_finger_app_switcher_enabled,
            commands::set_three_finger_app_switcher_enabled,
            commands::switcher_enter_search,
            commands::switcher_cancel,
        ])
        .setup(|app| {
            app.set_activation_policy(ActivationPolicy::Accessory);

            #[cfg(target_os = "macos")]
            app_manager::register_activation_observer();

            let quit = MenuItem::with_id(app, "quit", "Quit opcut", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(tauri::include_image!("./icons/tray-icon.png"))
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
            register_switcher_shortcuts(app.handle());

            #[cfg(target_os = "macos")]
            convert_main_to_panel(app.handle());

            gesture::register_monitor(app.handle())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
