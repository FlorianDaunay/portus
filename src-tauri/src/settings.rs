use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Stop the WSL Docker engine (and therefore every container) when Portus closes.
    pub stop_engine_on_exit: bool,
    /// WSL distribution hosting the engine Portus manages, remembered so it can be stopped later.
    pub engine_distro: Option<String>,
}

/// Per-user directory for Portus state (settings, engine client certificates).
pub fn data_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
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
