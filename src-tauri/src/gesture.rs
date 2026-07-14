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
    use serde::{Deserialize, Serialize};
    use std::ffi::c_void;
    use std::process::Command;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};
    use tauri_plugin_store::StoreExt;

    const BACKUP_KEY: &str = "three_finger_app_switcher_preferences";
    const BUILTIN_TRACKPAD_DOMAIN: &str = "com.apple.AppleMultitouchTrackpad";
    const BLUETOOTH_TRACKPAD_DOMAIN: &str = "com.apple.driver.AppleBluetoothMultitouch.trackpad";
    const THREE_FINGER_VERTICAL: &str = "TrackpadThreeFingerVertSwipeGesture";
    const FOUR_FINGER_VERTICAL: &str = "TrackpadFourFingerVertSwipeGesture";

    static GESTURE_ENABLED: AtomicBool = AtomicBool::new(false);
    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
    static SWIPE_RECOGNIZER: Mutex<SwipeRecognizer> = Mutex::new(SwipeRecognizer::new());

    const SWIPE_DISTANCE: f32 = 0.08;
    const DIRECTION_DOMINANCE: f32 = 1.2;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct MTPoint {
        x: f32,
        y: f32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct MTVector {
        position: MTPoint,
        velocity: MTPoint,
    }

    /// Reverse-engineered contact layout used by macOS's private MultitouchSupport framework.
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct MTTouch {
        frame: i32,
        timestamp: f64,
        path_index: i32,
        state: u32,
        finger_id: i32,
        hand_id: i32,
        normalized: MTVector,
        z_total: f32,
        field_9: i32,
        angle: f32,
        major_axis: f32,
        minor_axis: f32,
        absolute: MTVector,
        field_14: i32,
        field_15: i32,
        z_density: f32,
    }

    #[derive(Debug)]
    struct SwipeRecognizer {
        start: Option<(f32, f32)>,
        triggered: bool,
        blocked_until_clear: bool,
    }

    impl SwipeRecognizer {
        const fn new() -> Self {
            Self {
                start: None,
                triggered: false,
                blocked_until_clear: false,
            }
        }

        fn reset(&mut self) {
            self.start = None;
            self.triggered = false;
            self.blocked_until_clear = false;
        }

        fn update(&mut self, fingers: &[(f32, f32)]) -> bool {
            if fingers.len() >= 4 {
                self.start = None;
                self.triggered = false;
                self.blocked_until_clear = true;
                return false;
            }

            if fingers.len() <= 2 {
                self.reset();
                return false;
            }

            if self.blocked_until_clear || self.triggered {
                return false;
            }

            let count = fingers.len() as f32;
            let centroid = fingers
                .iter()
                .fold((0.0, 0.0), |sum, point| (sum.0 + point.0, sum.1 + point.1));
            let centroid = (centroid.0 / count, centroid.1 / count);
            let Some(start) = self.start else {
                self.start = Some(centroid);
                return false;
            };

            let delta_x = centroid.0 - start.0;
            let delta_y = centroid.1 - start.1;
            let horizontal = delta_x.abs() >= SWIPE_DISTANCE
                && delta_x.abs() > delta_y.abs() * DIRECTION_DOMINANCE;
            if horizontal {
                // Do not turn a three-finger Space switch into an app-switcher gesture.
                self.blocked_until_clear = true;
                self.start = None;
                return false;
            }

            let vertical = delta_y.abs() >= SWIPE_DISTANCE
                && delta_y.abs() > delta_x.abs() * DIRECTION_DOMINANCE;
            if vertical {
                self.triggered = true;
                return true;
            }

            false
        }
    }

    fn set_runtime_enabled(is_enabled: bool) {
        GESTURE_ENABLED.store(is_enabled, Ordering::SeqCst);
        if !is_enabled {
            if let Ok(mut recognizer) = SWIPE_RECOGNIZER.lock() {
                recognizer.reset();
            }
        }
    }

    #[link(name = "MultitouchSupport", kind = "framework")]
    unsafe extern "C" {
        fn MTDeviceCreateList() -> *const c_void;
        fn MTRegisterContactFrameCallback(
            device: *const c_void,
            callback: unsafe extern "C" fn(*const c_void, *const MTTouch, i32, f64, i32) -> i32,
        );
        fn MTDeviceStart(device: *const c_void, mode: i32) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFArrayGetCount(array: *const c_void) -> isize;
        fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
    }

    unsafe extern "C" fn contact_frame_callback(
        _device: *const c_void,
        touches: *const MTTouch,
        touch_count: i32,
        _timestamp: f64,
        _frame: i32,
    ) -> i32 {
        if !GESTURE_ENABLED.load(Ordering::SeqCst) {
            return 0;
        }
        if touches.is_null() || touch_count <= 0 {
            if let Ok(mut recognizer) = SWIPE_RECOGNIZER.lock() {
                recognizer.reset();
            }
            return 0;
        }

        let touches = unsafe { std::slice::from_raw_parts(touches, touch_count as usize) };
        let fingers: Vec<(f32, f32)> = touches
            .iter()
            // 3 = make touch, 4 = touching. Ignore hover, lift and linger contacts.
            .filter(|touch| matches!(touch.state, 3 | 4))
            .map(|touch| (touch.normalized.position.x, touch.normalized.position.y))
            .collect();

        let triggered = SWIPE_RECOGNIZER
            .lock()
            .map(|mut recognizer| recognizer.update(&fingers))
            .unwrap_or(false);

        if triggered {
            #[cfg(debug_assertions)]
            eprintln!("opcut: detected vertical three-finger swipe");
            if let Some(handle) = APP_HANDLE.get() {
                let handle = handle.clone();
                let main_thread_handle = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    crate::show_running_apps(&main_thread_handle);
                });
            }
        }

        // The macOS gesture is released through its saved preference mapping; raw contact
        // callbacks should never consume events needed by scrolling or four-finger gestures.
        0
    }

    fn register_raw_trackpad_monitor(app: &AppHandle) -> Result<(), String> {
        APP_HANDLE
            .set(app.clone())
            .map_err(|_| "The trackpad monitor was already registered".to_string())?;

        let devices = unsafe { MTDeviceCreateList() };
        if devices.is_null() {
            return Err("No multitouch trackpad was detected".to_string());
        }

        let device_count = unsafe { CFArrayGetCount(devices) };
        let mut started = 0;
        for index in 0..device_count {
            let device = unsafe { CFArrayGetValueAtIndex(devices, index) };
            if device.is_null() {
                continue;
            }
            unsafe {
                MTRegisterContactFrameCallback(device, contact_frame_callback);
                if MTDeviceStart(device, 0) == 0 {
                    started += 1;
                }
            }
        }

        // Deliberately do not CFRelease the created list. Keeping its devices alive for the
        // process avoids MultitouchSupport teardown races with in-flight callbacks.

        if started == 0 {
            Err("No multitouch trackpad could be started".to_string())
        } else {
            Ok(())
        }
    }

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
            set_runtime_enabled(should_enable);
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
        set_runtime_enabled(should_enable);
        Ok(should_enable)
    }

    pub fn register_monitor(app: &AppHandle) -> Result<(), String> {
        let is_enabled = enabled(app);
        set_runtime_enabled(is_enabled);

        if is_enabled {
            // Re-assert the mapping after login/relaunch without replacing the original backup.
            if stored_backup(app).is_none() {
                save_backup(app, &TrackpadPreferences::read())?;
            }
            restart_dock_if_needed(apply_hijack()?);
        }

        register_raw_trackpad_monitor(app)
    }

    #[cfg(test)]
    mod tests {
        use super::SwipeRecognizer;

        fn fingers(x: f32, y: f32, count: usize) -> Vec<(f32, f32)> {
            (0..count)
                .map(|index| (x + index as f32 * 0.01, y))
                .collect()
        }

        #[test]
        fn recognizes_one_vertical_swipe_until_fingers_clear() {
            let mut recognizer = SwipeRecognizer::new();
            assert!(!recognizer.update(&fingers(0.3, 0.3, 3)));
            assert!(recognizer.update(&fingers(0.31, 0.41, 3)));
            assert!(!recognizer.update(&fingers(0.31, 0.55, 3)));
            assert!(!recognizer.update(&[]));
            assert!(!recognizer.update(&fingers(0.3, 0.6, 3)));
            assert!(recognizer.update(&fingers(0.3, 0.49, 3)));
        }

        #[test]
        fn rejects_horizontal_and_four_finger_sequences() {
            let mut recognizer = SwipeRecognizer::new();
            assert!(!recognizer.update(&fingers(0.2, 0.3, 3)));
            assert!(!recognizer.update(&fingers(0.32, 0.31, 3)));
            assert!(!recognizer.update(&fingers(0.33, 0.45, 3)));

            assert!(!recognizer.update(&[]));
            assert!(!recognizer.update(&fingers(0.2, 0.3, 4)));
            assert!(!recognizer.update(&fingers(0.2, 0.45, 3)));
        }
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
