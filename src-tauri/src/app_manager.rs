use crate::config::AppInfo;
use std::fs;
use std::process::Command;

fn collect_apps_from_dir(dir: &str, apps: &mut Vec<AppInfo>, recurse: bool) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("app") {
            let Some(name) = path.file_stem().and_then(|n| n.to_str()) else { continue };
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
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.path == b.path);
    apps
}

pub fn launch_or_focus_app(path: &str) -> Result<(), String> {
    Command::new("open")
        .arg("-a")
        .arg(path)
        .spawn()
        .map_err(|e| format!("Failed to launch app: {}", e))?;
    Ok(())
}
