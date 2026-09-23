use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Which Docker engine Portus talks to.
#[derive(Serialize, Deserialize, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EngineSource {
    /// Try everything: the local socket/pipe, then the WSL engine, then the custom endpoint.
    #[default]
    Auto,
    /// The engine reachable through the local socket or named pipe (Docker Desktop, native Linux Docker, Colima...).
    Desktop,
    /// The engine Portus manages inside WSL.
    Wsl,
    /// A user-provided endpoint.
    Custom,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub engine_source: EngineSource,
    /// Address of the custom engine: `unix:///path`, `npipe:////./pipe/name` or `tcp://host:port`.
    pub custom_endpoint: Option<String>,
    /// Folder holding `ca.pem`, `cert.pem` and `key.pem` for a TLS-protected custom endpoint.
    pub custom_tls_dir: Option<String>,
    /// Stop the WSL Docker engine (and therefore every container) when Portus closes.
    pub stop_engine_on_exit: bool,
    /// WSL distribution hosting the engine Portus manages, remembered so it can be stopped later.
    pub engine_distro: Option<String>,
}

/// Per-user directory for Portus state (settings, engine client certificates).
pub fn data_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| {
            if cfg!(target_os = "macos") {
                std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library").join("Application Support"))
            } else {
                None
            }
        })
        .or_else(|| std::env::var_os("XDG_DATA_HOME").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(std::env::temp_dir);
    base.join("Portus")
}

fn path() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn load() -> Settings {
    std::fs::read_to_string(path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(settings: &Settings) -> Result<(), String> {
    std::fs::create_dir_all(data_dir()).map_err(|e| format!("Could not create the settings folder: {e}"))?;
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path(), text).map_err(|e| format!("Could not save settings: {e}"))
}

pub fn update(change: impl FnOnce(&mut Settings)) -> Result<Settings, String> {
    let mut settings = load();
    change(&mut settings);
    save(&settings)?;
    Ok(settings)
}
