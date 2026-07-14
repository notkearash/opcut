use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const ENABLED_KEY: &str = "three_finger_app_switcher_enabled";

pub fn enabled(app: &AppHandle) -> bool {
    let store = app.store("config.json").expect("failed to access store");
    store
        .get(ENABLED_KEY)
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{enabled, AppHandle, ENABLED_KEY};
    use block2::RcBlock;
    use objc2_app_kit::{NSEvent, NSEventMask};
    use serde::{Deserialize, Serialize};
    use std::process::Command;
    use std::ptr::NonNull;
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri_plugin_store::StoreExt;

    const BACKUP_KEY: &str = "three_finger_app_switcher_preferences";
    const BUILTIN_TRACKPAD_DOMAIN: &str = "com.apple.AppleMultitouchTrackpad";
    const BLUETOOTH_TRACKPAD_DOMAIN: &str = "com.apple.driver.AppleBluetoothMultitouch.trackpad";
    const THREE_FINGER_VERTICAL: &str = "TrackpadThreeFingerVertSwipeGesture";
    const FOUR_FINGER_VERTICAL: &str = "TrackpadFourFingerVertSwipeGesture";

    static GESTURE_ENABLED: AtomicBool = AtomicBool::new(false);

    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct TrackpadPreferences {
        builtin_three_finger_vertical: Option<i32>,
        builtin_four_finger_vertical: Option<i32>,
        bluetooth_three_finger_vertical: Option<i32>,
        bluetooth_four_finger_vertical: Option<i32>,
    }

    impl TrackpadPreferences {
        fn read() -> Self {
            Self {
                builtin_three_finger_vertical: read_preference(
                    BUILTIN_TRACKPAD_DOMAIN,
                    THREE_FINGER_VERTICAL,
                ),
                builtin_four_finger_vertical: read_preference(
                    BUILTIN_TRACKPAD_DOMAIN,
                    FOUR_FINGER_VERTICAL,
                ),
                bluetooth_three_finger_vertical: read_preference(
                    BLUETOOTH_TRACKPAD_DOMAIN,
                    THREE_FINGER_VERTICAL,
                ),
                bluetooth_four_finger_vertical: read_preference(
                    BLUETOOTH_TRACKPAD_DOMAIN,
                    FOUR_FINGER_VERTICAL,
                ),
            }
        }

        fn restore(&self) -> Result<bool, String> {
            let mut changed = false;
            changed |= restore_preference(
                BUILTIN_TRACKPAD_DOMAIN,
                THREE_FINGER_VERTICAL,
                self.builtin_three_finger_vertical,
            )?;
            changed |= restore_preference(
                BUILTIN_TRACKPAD_DOMAIN,
                FOUR_FINGER_VERTICAL,
                self.builtin_four_finger_vertical,
            )?;
            changed |= restore_preference(
                BLUETOOTH_TRACKPAD_DOMAIN,
                THREE_FINGER_VERTICAL,
                self.bluetooth_three_finger_vertical,
            )?;
            changed |= restore_preference(
                BLUETOOTH_TRACKPAD_DOMAIN,
                FOUR_FINGER_VERTICAL,
                self.bluetooth_four_finger_vertical,
            )?;
            Ok(changed)
        }
    }

    fn defaults(args: &[&str]) -> Result<std::process::Output, String> {
        Command::new("/usr/bin/defaults")
            .args(args)
            .output()
            .map_err(|error| format!("Could not update trackpad preferences: {error}"))
    }

    fn read_preference(domain: &str, key: &str) -> Option<i32> {
        let output = defaults(&["read", domain, key]).ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout).trim().parse().ok()
    }

    fn write_preference(domain: &str, key: &str, value: i32) -> Result<bool, String> {
        if read_preference(domain, key) == Some(value) {
            return Ok(false);
        }
        let value = value.to_string();
        let output = defaults(&["write", domain, key, "-int", &value])?;
        if output.status.success() {
            Ok(true)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }

    fn restore_preference(domain: &str, key: &str, original: Option<i32>) -> Result<bool, String> {
        if let Some(value) = original {
            return write_preference(domain, key, value);
        }
        if read_preference(domain, key).is_none() {
            return Ok(false);
        }
        let output = defaults(&["delete", domain, key])?;
        if output.status.success() {
            Ok(true)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }

    fn apply_hijack() -> Result<bool, String> {
        let mut changed = false;

        // Free the vertical three-finger swipe for AppKit and keep the native macOS
        // overview gestures available with four fingers.
        changed |= write_preference(BUILTIN_TRACKPAD_DOMAIN, THREE_FINGER_VERTICAL, 0)?;
        changed |= write_preference(BUILTIN_TRACKPAD_DOMAIN, FOUR_FINGER_VERTICAL, 2)?;
        changed |= write_preference(BLUETOOTH_TRACKPAD_DOMAIN, THREE_FINGER_VERTICAL, 0)?;
        changed |= write_preference(BLUETOOTH_TRACKPAD_DOMAIN, FOUR_FINGER_VERTICAL, 2)?;
        Ok(changed)
    }

    fn restart_dock_if_needed(changed: bool) {
        if changed {
            // Dock owns the system Mission Control gesture. It relaunches automatically.
            let _ = Command::new("/usr/bin/killall").arg("Dock").status();
        }
    }

    fn stored_backup(app: &AppHandle) -> Option<TrackpadPreferences> {
        let store = app.store("config.json").ok()?;
        store
            .get(BACKUP_KEY)
            .and_then(|value| serde_json::from_value(value).ok())
    }

    fn save_backup(app: &AppHandle, preferences: &TrackpadPreferences) -> Result<(), String> {
        let store = app
            .store("config.json")
            .map_err(|error| error.to_string())?;
        let value = serde_json::to_value(preferences).map_err(|error| error.to_string())?;
        store.set(BACKUP_KEY, value);
        store.save().map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn set_enabled(app: &AppHandle, should_enable: bool) -> Result<bool, String> {
        if should_enable == enabled(app) {
            GESTURE_ENABLED.store(should_enable, Ordering::SeqCst);
            return Ok(should_enable);
        }

        let store = app
            .store("config.json")
            .map_err(|error| error.to_string())?;
        if should_enable {
            let preferences = TrackpadPreferences::read();
            save_backup(app, &preferences)?;
            match apply_hijack() {
                Ok(changed) => restart_dock_if_needed(changed),
                Err(error) => {
                    let _ = preferences.restore();
                    store.delete(BACKUP_KEY);
                    let _ = store.save();
                    return Err(error);
                }
            }
        } else if let Some(preferences) = stored_backup(app) {
            let changed = preferences.restore()?;
            restart_dock_if_needed(changed);
            store.delete(BACKUP_KEY);
        }

        store.set(ENABLED_KEY, serde_json::json!(should_enable));
        store.save().map_err(|error| error.to_string())?;
        GESTURE_ENABLED.store(should_enable, Ordering::SeqCst);
        Ok(should_enable)
    }

    pub fn register_monitor(app: &AppHandle) -> Result<(), String> {
        let is_enabled = enabled(app);
        GESTURE_ENABLED.store(is_enabled, Ordering::SeqCst);

        if is_enabled {
            // Re-assert the mapping after login/relaunch without replacing the original backup.
            if stored_backup(app).is_none() {
                save_backup(app, &TrackpadPreferences::read())?;
            }
            restart_dock_if_needed(apply_hijack()?);
        }

        let handle = app.clone();
        let block = RcBlock::new(move |event_ptr: NonNull<NSEvent>| {
            if !GESTURE_ENABLED.load(Ordering::SeqCst) {
                return;
            }

            // NSEvent swipe deltas are directional unit values. Only claim vertical swipes;
            // horizontal three-finger Space switching remains untouched.
            let event = unsafe { event_ptr.as_ref() };
            let delta_x = unsafe { event.deltaX() };
            let delta_y = unsafe { event.deltaY() };
            if delta_y.abs() <= delta_x.abs() || delta_y.abs() < 0.5 {
                return;
            }

            let handle = handle.clone();
            let main_thread_handle = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                crate::show_running_apps(&main_thread_handle);
            });
        });

        let monitor = unsafe {
            NSEvent::addGlobalMonitorForEventsMatchingMask_handler(NSEventMask::Swipe, &block)
        }
        .ok_or_else(|| "Could not register the three-finger gesture monitor".to_string())?;

        // AppKit owns the monitor registration, but the returned token must stay alive for
        // the duration of the process. The OS releases it when opcut exits.
        std::mem::forget(monitor);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub use macos::{register_monitor, set_enabled};

#[cfg(not(target_os = "macos"))]
pub fn set_enabled(_app: &AppHandle, _enabled: bool) -> Result<bool, String> {
    Err("Three-finger app switching is only supported on macOS".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn register_monitor(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}
