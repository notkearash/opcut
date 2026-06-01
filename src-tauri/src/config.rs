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

/// A coding-agent CLI that can be invoked from the launcher via a `?xx` prefix.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTemplate {
    /// Prefix id without the leading `?` — e.g. "oc", "cc", "oi".
    pub id: String,
    /// Human label shown in the UI — e.g. "opencode".
    pub label: String,
    /// Program to execute. Bare command name (resolved by Ghostty's shell) or absolute path.
    pub program: String,
    /// Flags inserted before the prompt argument.
    #[serde(default)]
    pub args_before: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Working directory used when the query has no inline `@ <path>`. `~` is expanded at run time.
    pub default_cwd: String,
    pub agents: Vec<AgentTemplate>,
    /// When true, run the agent via `sh -lc 'cd <cwd> && exec <program> …'` instead of relying on
    /// Ghostty's `--working-directory`. Off by default.
    #[serde(default)]
    pub use_cd_fallback: bool,
}

impl Default for AgentConfig {
    fn default() -> Self {
        AgentConfig {
            default_cwd: "~".to_string(),
            use_cd_fallback: false,
            agents: vec![
                AgentTemplate {
                    id: "oc".to_string(),
                    label: "opencode".to_string(),
                    program: "opencode".to_string(),
                    args_before: vec![],
                },
                AgentTemplate {
                    id: "cc".to_string(),
                    label: "claude code".to_string(),
                    program: "claude".to_string(),
                    args_before: vec![],
                },
                AgentTemplate {
                    id: "oi".to_string(),
                    label: "codex".to_string(),
                    program: "codex".to_string(),
                    args_before: vec![],
                },
                AgentTemplate {
                    id: "pi".to_string(),
                    label: "pi".to_string(),
                    program: "pi".to_string(),
                    args_before: vec![],
                },
            ],
        }
    }
}
