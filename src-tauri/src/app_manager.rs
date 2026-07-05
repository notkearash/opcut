use crate::config::AppInfo;
use std::fs;
use std::process::Command;

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
            let Some(bundle_url) = (unsafe { app.bundleURL() }) else {
                continue;
            };
            let Some(path) = (unsafe { bundle_url.path() }) else {
                continue;
            };

            apps.push(AppInfo {
                name: name.to_string(),
                path: path.to_string(),
            });
        }

        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps.dedup_by(|a, b| a.path == b.path);
        apps
    })
}

#[cfg(not(target_os = "macos"))]
pub fn list_running_apps() -> Vec<AppInfo> {
    Vec::new()
}

pub fn launch_or_focus_app(path: &str) -> Result<(), String> {
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

/// Launch a coding-agent CLI interactively in Ghostty, in `cwd`, with `prompt` as its argument.
///
/// On macOS the only reliable way to open a Ghostty terminal from the CLI is via
/// `open -na Ghostty.app --args …`; direct `ghostty -e` does not spawn a window.
pub fn run_agent_in_ghostty(
    program: &str,
    args_before: &[String],
    prompt: &str,
    cwd: &str,
    use_cd_fallback: bool,
) -> Result<(), String> {
    if !std::path::Path::new("/Applications/Ghostty.app").exists() {
        return Err("Ghostty not found in /Applications".to_string());
    }

    let mut cmd = Command::new("open");
    cmd.arg("-n").arg("-a").arg("Ghostty").arg("--args");

    if use_cd_fallback {
        // Build a single shell command so `cd` runs before the agent. Quote via single-quotes
        // and escape any embedded single quotes.
        let mut shell_cmd = format!("cd {} && exec {}", shell_quote(cwd), shell_quote(program));
        for a in args_before {
            shell_cmd.push(' ');
            shell_cmd.push_str(&shell_quote(a));
        }
        shell_cmd.push(' ');
        shell_cmd.push_str(&shell_quote(prompt));
        cmd.arg("-e").arg("/bin/sh").arg("-lc").arg(shell_cmd);
    } else {
        cmd.arg(format!("--working-directory={}", cwd));
        cmd.arg("-e").arg(program);
        for a in args_before {
            cmd.arg(a);
        }
        cmd.arg(prompt);
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to launch Ghostty: {}", e))?;
    Ok(())
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
