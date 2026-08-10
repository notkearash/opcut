use crate::config::AppInfo;
use std::fs;
use std::process::Command;

const RECENT_APP_LIMIT: usize = 128;

fn promote_recent_path(paths: &mut Vec<String>, path: &str) {
    paths.retain(|existing| existing != path);
    paths.insert(0, path.to_string());
    paths.truncate(RECENT_APP_LIMIT);
}

fn sort_by_recency(apps: &mut [AppInfo], recent_paths: &[String]) {
    apps.sort_by(|a, b| {
        let a_rank = recent_paths
            .iter()
            .position(|path| path == &a.path)
            .unwrap_or(usize::MAX);
        let b_rank = recent_paths
            .iter()
            .position(|path| path == &b.path)
            .unwrap_or(usize::MAX);
        a_rank
            .cmp(&b_rank)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
}

#[cfg(target_os = "macos")]
mod recent_apps {
    use super::{promote_recent_path, AppInfo};
    use block2::global_block;
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{
        NSRunningApplication, NSWorkspace, NSWorkspaceDidActivateApplicationNotification,
    };
    use objc2_foundation::NSNotification;
    use std::ptr::NonNull;
    use std::sync::Mutex;

    static PATHS: Mutex<Vec<String>> = Mutex::new(Vec::new());

    fn app_path(app: &NSRunningApplication) -> Option<String> {
        let bundle_url = unsafe { app.bundleURL() }?;
        let path = unsafe { bundle_url.path() }?;
        Some(path.to_string())
    }

    fn record_frontmost_app() {
        autoreleasepool(|_| {
            let workspace = unsafe { NSWorkspace::sharedWorkspace() };
            let Some(app) = (unsafe { workspace.frontmostApplication() }) else {
                return;
            };
            let Some(path) = app_path(&app) else {
                return;
            };
            if let Ok(mut paths) = PATHS.lock() {
                promote_recent_path(&mut paths, &path);
            }
        });
    }

    global_block! {
        static DID_ACTIVATE_APP = |_notification: NonNull<NSNotification>| {
            record_frontmost_app();
        };
    }

    pub(super) fn register_observer() {
        record_frontmost_app();
        autoreleasepool(|_| {
            let workspace = unsafe { NSWorkspace::sharedWorkspace() };
            let center = unsafe { workspace.notificationCenter() };
            // The notification center retains this observer for its own lifetime.
            let _observer = unsafe {
                center.addObserverForName_object_queue_usingBlock(
                    Some(NSWorkspaceDidActivateApplicationNotification),
                    None,
                    None,
                    &DID_ACTIVATE_APP,
                )
            };
        });
    }

    pub(super) fn snapshot() -> Vec<String> {
        PATHS.lock().map(|paths| paths.clone()).unwrap_or_default()
    }

    pub(super) fn record_path(path: &str) {
        if let Ok(mut paths) = PATHS.lock() {
            promote_recent_path(&mut paths, path);
        }
    }

    pub(super) fn path_for(app: &NSRunningApplication) -> Option<String> {
        app_path(app)
    }

    pub(super) fn sort(apps: &mut [AppInfo]) {
        super::sort_by_recency(apps, &snapshot());
    }
}

#[cfg(target_os = "macos")]
pub fn register_activation_observer() {
    recent_apps::register_observer();
}

fn collect_apps_from_dir(dir: &str, apps: &mut Vec<AppInfo>, recurse: bool) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("app") {
            let Some(name) = path.file_stem().and_then(|n| n.to_str()) else {
                continue;
            };
            apps.push(AppInfo {
                name: name.to_string(),
                path: path.to_string_lossy().to_string(),
            });
        } else if recurse && path.is_dir() && path.extension().is_none() {
            collect_apps_from_dir(&path.to_string_lossy(), apps, false);
        }
    }
}

pub fn list_installed_apps() -> Vec<AppInfo> {
    let mut apps = Vec::new();
    for dir in ["/Applications", "/System/Applications"] {
        collect_apps_from_dir(dir, &mut apps, true);
    }
    // Finder lives outside the usual app directories; include it explicitly.
    let finder_path = "/System/Library/CoreServices/Finder.app";
    if std::path::Path::new(finder_path).exists() {
        apps.push(AppInfo {
            name: "Finder".to_string(),
            path: finder_path.to_string(),
        });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.path == b.path);
    apps
}

#[cfg(target_os = "macos")]
pub fn list_running_apps() -> Vec<AppInfo> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace};

    autoreleasepool(|_| {
        let workspace = unsafe { NSWorkspace::sharedWorkspace() };
        let running_apps = unsafe { workspace.runningApplications() };
        let mut apps = Vec::new();

        for i in 0..running_apps.len() {
            let Some(app) = running_apps.get(i) else {
                continue;
            };
            if unsafe { app.isTerminated() }
                || unsafe { app.activationPolicy() } != NSApplicationActivationPolicy::Regular
            {
                continue;
            }

            let Some(name) = (unsafe { app.localizedName() }) else {
                continue;
            };
            let Some(path) = recent_apps::path_for(&app) else {
                continue;
            };

            apps.push(AppInfo {
                name: name.to_string(),
                path,
            });
        }

        // Deduplicate by bundle path before applying the activation history.
        apps.sort_by(|a, b| a.path.cmp(&b.path));
        apps.dedup_by(|a, b| a.path == b.path);
        recent_apps::sort(&mut apps);
        apps
    })
}

#[cfg(not(target_os = "macos"))]
pub fn list_running_apps() -> Vec<AppInfo> {
    Vec::new()
}

#[cfg(target_os = "macos")]
pub fn terminate_running_app(path: &str) -> Result<(), String> {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace};

    autoreleasepool(|_| {
        let workspace = unsafe { NSWorkspace::sharedWorkspace() };
        let running_apps = unsafe { workspace.runningApplications() };

        for i in 0..running_apps.len() {
            let Some(app) = running_apps.get(i) else {
                continue;
            };
            if unsafe { app.isTerminated() }
                || unsafe { app.activationPolicy() } != NSApplicationActivationPolicy::Regular
            {
                continue;
            }

            let Some(bundle_url) = (unsafe { app.bundleURL() }) else {
                continue;
            };
            let Some(bundle_path) = (unsafe { bundle_url.path() }) else {
                continue;
            };
            if bundle_path.to_string() != path {
                continue;
            }

            // `terminate()` posts an async quit request (like ⌘Q) and returns
            // whether the request was accepted. We must NOT block the main thread
            // waiting for it to finish — this command runs on the main thread, and
            // sleeping here freezes the run loop (so `isTerminated` never updates
            // and the whole UI hangs). Fire the request and return; the frontend
            // reconciles via `refreshApps`.
            if unsafe { app.terminate() } {
                return Ok(());
            }
            return Err("App declined to quit".to_string());
        }

        Err("App is not running".to_string())
    })
}

#[cfg(not(target_os = "macos"))]
pub fn terminate_running_app(_path: &str) -> Result<(), String> {
    Err("Quitting running apps is only supported on macOS".to_string())
}

pub fn launch_or_focus_app(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    recent_apps::record_path(path);

    Command::new("open")
        .arg("-a")
        .arg(path)
        .spawn()
        .map_err(|e| format!("Failed to launch app: {}", e))?;
    Ok(())
}

fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

/// Expand a leading `~`, then verify the directory exists. Falls back to `fallback`
/// (also tilde-expanded), and finally to `$HOME`, so the returned path is always a real dir.
pub fn expand_and_validate_cwd(raw: &str, fallback: &str) -> String {
    let expand = |p: &str| -> String {
        let trimmed = p.trim();
        if trimmed == "~" {
            home_dir()
        } else if let Some(rest) = trimmed.strip_prefix("~/") {
            format!("{}/{}", home_dir(), rest)
        } else {
            trimmed.to_string()
        }
    };

    let candidate = expand(raw);
    if std::path::Path::new(&candidate).is_dir() {
        return candidate;
    }
    let fb = expand(fallback);
    if std::path::Path::new(&fb).is_dir() {
        return fb;
    }
    home_dir()
}

/// Run an arbitrary shell command in a Ghostty window, in `cwd`. After the command exits we
/// `exec` an interactive login shell so the window stays open and the output remains visible.
pub fn run_shell_in_ghostty(command: &str, cwd: &str) -> Result<(), String> {
    if !std::path::Path::new("/Applications/Ghostty.app").exists() {
        return Err("Ghostty not found in /Applications".to_string());
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    // `command` is raw user input — it IS the shell command, so it is interpolated unquoted.
    let script = format!(
        "cd {} && {}; exec {} -l",
        shell_quote(cwd),
        command,
        shell_quote(&shell),
    );

    Command::new("open")
        .arg("-n")
        .arg("-a")
        .arg("Ghostty")
        .arg("--args")
        .arg("-e")
        .arg("/bin/sh")
        .arg("-lc")
        .arg(script)
        .spawn()
        .map_err(|e| format!("Failed to launch Ghostty: {}", e))?;
    Ok(())
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::{promote_recent_path, sort_by_recency, AppInfo, RECENT_APP_LIMIT};

    fn app(name: &str) -> AppInfo {
        AppInfo {
            name: name.to_string(),
            path: format!("/{name}.app"),
        }
    }

    #[test]
    fn promoting_a_path_moves_it_to_the_front_without_duplicates() {
        let mut paths = vec!["/A.app".to_string(), "/B.app".to_string()];
        promote_recent_path(&mut paths, "/B.app");
        assert_eq!(paths, ["/B.app", "/A.app"]);

        for i in 0..RECENT_APP_LIMIT + 5 {
            promote_recent_path(&mut paths, &format!("/{i}.app"));
        }
        assert_eq!(paths.len(), RECENT_APP_LIMIT);
    }

    #[test]
    fn recent_apps_sort_first_with_alphabetical_fallback() {
        let mut apps = vec![app("Beta"), app("Alpha"), app("Gamma")];
        let recent = vec!["/Gamma.app".to_string(), "/Beta.app".to_string()];
        sort_by_recency(&mut apps, &recent);
        let names: Vec<_> = apps.iter().map(|app| app.name.as_str()).collect();
        assert_eq!(names, ["Gamma", "Beta", "Alpha"]);
    }
}
