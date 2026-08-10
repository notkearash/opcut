use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SlotConfig {
    pub slots: [Option<AppConfig>; 9],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
}

/// Settings for the `!` shell route.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellConfig {
    /// Directory shell commands run in when the query carries no inline `@ <path>`.
    /// Stored expanded, so the UI can display it against the user's home dir.
    pub cwd: String,
}

impl Default for ShellConfig {
    fn default() -> Self {
        ShellConfig {
            cwd: "~".to_string(),
        }
    }
}
