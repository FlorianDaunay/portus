use crate::docker;
use crate::docker::compose::ComposeProject;
use crate::docker::containers::ContainerSummary;
use crate::docker::engine::{EngineManager, EngineStatus};
use crate::docker::images::ImageSummary;
use crate::docker::volumes::VolumeSummary;
use crate::settings::{self, EngineSource, Settings};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DaemonInfo {
    pub connected: bool,
    pub managed: bool,
    /// Kind of engine answering: `local`, `wsl` or `custom`.
    pub source: String,
    pub version: String,
    pub containers_running: usize,
    pub containers_stopped: usize,
    pub images: usize,
    pub images_size_mb: f64,
    /// Logical CPUs and total memory of the machine running the engine.
    pub cpus: usize,
    pub mem_total_mb: f64,
    /// Share of the engine host's CPU used by the running containers (0-100).
    pub cpu_percent: f64,
    pub mem_used_mb: f64,
}

impl DaemonInfo {
    fn disconnected() -> Self {
        DaemonInfo {
            connected: false,
            managed: false,
            source: String::new(),
            version: String::new(),
            containers_running: 0,
            containers_stopped: 0,
            images: 0,
            images_size_mb: 0.0,
            cpus: 0,
            mem_total_mb: 0.0,
            cpu_percent: 0.0,
            mem_used_mb: 0.0,
        }
    }
}

#[tauri::command]
pub fn get_settings() -> Settings {
    settings::load()
}

#[tauri::command]
pub fn set_stop_engine_on_exit(value: bool) -> Result<Settings, String> {
    settings::update(|s| s.stop_engine_on_exit = value)
}

/// Picks which engine Portus talks to. `endpoint`/`tls_dir` are only kept for the custom source.
#[tauri::command]
pub fn set_engine_source(
    source: EngineSource,
    endpoint: Option<String>,
    tls_dir: Option<String>,
) -> Result<Settings, String> {
    let endpoint = endpoint.map(|e| e.trim().to_string()).filter(|e| !e.is_empty());
    let tls_dir = tls_dir.map(|d| d.trim().to_string()).filter(|d| !d.is_empty());
    if source == EngineSource::Custom {
        let Some(address) = &endpoint else {
            return Err("Enter the address of the Docker engine.".into());
        };
        if !["unix://", "npipe://", "tcp://", "http://", "https://"].iter().any(|p| address.starts_with(p)) {
            return Err("The address must start with unix://, npipe:// or tcp://.".into());
        }
    }
    settings::update(|s| {
        s.engine_source = source;
        if source == EngineSource::Custom {
            s.custom_endpoint = endpoint;
            s.custom_tls_dir = tls_dir;
        }
    })
}

#[tauri::command]
pub async fn stop_engine(
    mgr: tauri::State<'_, EngineManager>,
) -> Result<EngineStatus, String> {
    Ok(docker::engine::stop(&mgr).await)
}


#[tauri::command]
pub async fn get_engine_status(
    mgr: tauri::State<'_, EngineManager>,
) -> Result<EngineStatus, String> {
    Ok(docker::engine::status(&mgr).await)
}

#[tauri::command]
pub async fn start_engine(
    app: AppHandle,
    mgr: tauri::State<'_, EngineManager>,
) -> Result<EngineStatus, String> {
    Ok(docker::engine::start(&app, &mgr).await)
}

#[tauri::command]
pub async fn takeover_engine(
    app: AppHandle,
    mgr: tauri::State<'_, EngineManager>,
) -> Result<EngineStatus, String> {
    Ok(docker::engine::takeover(&app, &mgr).await)
}

#[tauri::command]
pub async fn install_engine(
    app: AppHandle,
    mgr: tauri::State<'_, EngineManager>,
) -> Result<EngineStatus, String> {
    Ok(docker::engine::install(&app, &mgr).await)
}

#[tauri::command]
pub async fn get_daemon_info() -> Result<DaemonInfo, String> {
    if !docker::engine::detect().await {
        return Ok(DaemonInfo::disconnected());
    }
    let Ok(docker) = docker::connect() else {
        return Ok(DaemonInfo::disconnected());
    };

    let Ok(version) = docker.version().await else {
        return Ok(DaemonInfo::disconnected());
    };

    let containers = docker::containers::list(&docker).await.unwrap_or_default();
    let images = docker::images::list(&docker).await.unwrap_or_default();

    let running = containers.iter().filter(|c| c.status == "running").count();
    let stopped = containers.len() - running;
    let images_size_mb = images.iter().map(|i| i.size_mb).sum::<f64>();

    let host = docker.info().await.ok();
    let cpus = host.as_ref().and_then(|i| i.ncpu).unwrap_or(0).max(0) as usize;
    let mem_total_mb = host.as_ref().and_then(|i| i.mem_total).unwrap_or(0).max(0) as f64 / (1024.0 * 1024.0);
    let cpu_sum = containers.iter().map(|c| c.cpu_percent).sum::<f64>();
    let cpu_share = if cpus > 0 { cpu_sum / (cpus as f64) } else { cpu_sum };
    let cpu_percent = cpu_share.min(100.0);
    let mem_used_mb = containers.iter().map(|c| c.mem_usage_mb).sum::<f64>();

    Ok(DaemonInfo {
        connected: true,
        managed: docker::engine::is_managed(),
        source: docker::engine::connection_kind().to_string(),
        version: version.version.unwrap_or_default(),
        containers_running: running,
        containers_stopped: stopped,
        images: images.len(),
        images_size_mb,
        cpus,
        mem_total_mb,
        cpu_percent,
        mem_used_mb,
    })
}

#[tauri::command]
pub async fn list_containers() -> Result<Vec<ContainerSummary>, String> {
    let docker = docker::connect()?;
    docker::containers::list(&docker).await
}

#[tauri::command]
pub async fn start_container(id: String) -> Result<(), String> {
    let docker = docker::connect()?;
    docker::containers::start(&docker, &id).await
}

#[tauri::command]
pub async fn stop_container(id: String) -> Result<(), String> {
    let docker = docker::connect()?;
    docker::containers::stop(&docker, &id).await
}

#[tauri::command]
pub async fn restart_container(id: String) -> Result<(), String> {
    let docker = docker::connect()?;
    docker::containers::restart(&docker, &id).await
}

#[tauri::command]
pub async fn remove_container(id: String) -> Result<(), String> {
    let docker = docker::connect()?;
    docker::containers::remove(&docker, &id).await
}

#[tauri::command]
pub async fn list_images() -> Result<Vec<ImageSummary>, String> {
    let docker = docker::connect()?;
    docker::images::list(&docker).await
}

#[tauri::command]
pub async fn remove_image(id: String) -> Result<(), String> {
    let docker = docker::connect()?;
    docker::images::remove(&docker, &id).await
}

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<VolumeSummary>, String> {
    let docker = docker::connect()?;
    docker::volumes::list(&docker).await
}

#[tauri::command]
pub async fn remove_volume(name: String) -> Result<(), String> {
    let docker = docker::connect()?;
    docker::volumes::remove(&docker, &name).await
}

#[tauri::command]
pub async fn list_compose_projects() -> Result<Vec<ComposeProject>, String> {
    let docker = docker::connect()?;
    docker::compose::list(&docker).await
}

#[tauri::command]
pub async fn list_recent_logs() -> Result<Vec<docker::logs::LogLine>, String> {
    let docker = docker::connect()?;
    let containers = docker::containers::list(&docker).await?;
    let mut all = Vec::new();
    for c in containers.into_iter().filter(|c| c.status == "running").take(5) {
        all.extend(docker::logs::recent(&docker, &c.id, &c.name).await);
    }
    all.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    Ok(all)
}

#[tauri::command]
pub async fn stream_container_logs(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<(), String> {
    let docker = docker::connect()?;
    tauri::async_runtime::spawn(async move {
        let _ = docker::logs::stream_to_frontend(&docker, app, id, name).await;
    });
    Ok(())
}
