use serde::{Deserialize, Serialize};

pub const SLOT_COUNT: usize = 9;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SlotConfig {
    pub slots: [Option<AppConfig>; SLOT_COUNT],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellConfig {
    pub cwd: String,
}

impl Default for ShellConfig {
    fn default() -> Self {
        ShellConfig {
            cwd: "~".to_string(),
        }
    }
}
