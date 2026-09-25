use crate::docker;
use crate::docker::compose::ComposeProject;
use crate::docker::containers::ContainerSummary;
use crate::docker::engine::{EngineManager, EngineStatus};
use crate::docker::images::ImageSummary;
use crate::docker::volumes::VolumeSummary;
use crate::registry;
use crate::settings::{self, EngineSource, Settings};
use crate::console::ConsoleManager;
use crate::migration::{Job, MigrationManager, Request as MigrationRequest};
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

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
pub fn get_settings(app: AppHandle) -> Settings {
    let mut saved = settings::load();
    // The OS registration is the source of truth: the user may have removed the entry themselves.
    saved.launch_at_startup = app.autolaunch().is_enabled().unwrap_or(saved.launch_at_startup);
    saved
}

#[tauri::command]
pub fn set_keep_running_in_background(value: bool) -> Result<Settings, String> {
    settings::update(|s| s.keep_running_in_background = value)
}

#[tauri::command]
pub fn set_start_minimized(value: bool) -> Result<Settings, String> {
    settings::update(|s| s.start_minimized = value)
}

#[tauri::command]
pub fn set_launch_at_startup(app: AppHandle, value: bool) -> Result<Settings, String> {
    let autolaunch = app.autolaunch();
    if value {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    }
    .map_err(|e| format!("Could not change the startup registration: {e}"))?;
    settings::update(|s| s.launch_at_startup = value)
}

#[tauri::command]
pub async fn list_engines() -> Vec<docker::engine::EngineInfo> {
    docker::engine::available().await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineContents {
    pub containers: Vec<ContainerSummary>,
    pub images: Vec<ImageSummary>,
    pub volumes: Vec<VolumeSummary>,
}

/// Everything one engine holds, for the migration page (independent of the engine picked in the top bar).
#[tauri::command]
pub async fn get_engine_contents(kind: String) -> Result<EngineContents, String> {
    let docker = docker::engine::client_for_kind(&kind)?;
    Ok(EngineContents {
        containers: docker::containers::list(&docker).await?,
        images: docker::images::list(&docker).await?,
        volumes: docker::volumes::list(&docker).await?,
    })
}

#[tauri::command]
pub fn list_migrations(mgr: tauri::State<'_, MigrationManager>) -> Vec<Job> {
    mgr.list()
}

#[tauri::command]
pub fn start_migration(
    app: AppHandle,
    mgr: tauri::State<'_, MigrationManager>,
    request: MigrationRequest,
) -> Result<Job, String> {
    mgr.enqueue(&app, request)
}

#[tauri::command]
pub fn cancel_migration(app: AppHandle, mgr: tauri::State<'_, MigrationManager>, id: u64) {
    mgr.cancel(&app, id);
}

#[tauri::command]
pub fn clear_migration_history(mgr: tauri::State<'_, MigrationManager>) {
    mgr.clear_history();
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

/// Runs a docker command line; its output arrives as `console-output` events, then `console-exit`.
#[tauri::command]
pub fn run_console_command(
    app: AppHandle,
    mgr: tauri::State<'_, ConsoleManager>,
    run_id: u64,
    line: String,
) -> Result<(), String> {
    mgr.run(&app, run_id, &line)
}

#[tauri::command]
pub fn cancel_console_command(mgr: tauri::State<'_, ConsoleManager>, run_id: u64) {
    mgr.cancel(run_id);
}

#[tauri::command]
pub async fn get_network_map() -> Result<docker::networks::NetworkMap, String> {
    let docker = docker::connect()?;
    docker::networks::map(&docker).await
}

#[tauri::command]
pub fn list_registries() -> Vec<registry::RegistryInfo> {
    registry::infos()
}

#[tauri::command]
pub fn save_registry(input: registry::RegistryInput) -> Result<Vec<registry::RegistryInfo>, String> {
    registry::upsert(input)
}

#[tauri::command]
pub fn remove_registry(id: String) -> Result<Vec<registry::RegistryInfo>, String> {
    registry::remove(&id)
}

#[tauri::command]
pub async fn test_registry(id: String) -> Result<(), String> {
    registry::test(&registry::get(&id)?).await
}

#[tauri::command]
pub async fn search_registry(id: String, query: String) -> Result<Vec<registry::RepoHit>, String> {
    registry::search(&registry::get(&id)?, &query).await
}

#[tauri::command]
pub async fn list_registry_tags(id: String, repository: String) -> Result<Vec<String>, String> {
    registry::tags(&registry::get(&id)?, &repository).await
}

/// Returns the full reference that was pulled.
#[tauri::command]
pub async fn pull_from_registry(app: AppHandle, id: String, repository: String, tag: String) -> Result<String, String> {
    let reg = registry::get(&id)?;
    let docker = docker::connect()?;
    docker::registry::pull(&app, &docker, &reg, &repository, &tag).await
}

/// `source` is a local image id or `repo:tag`. Returns the full reference that was pushed.
#[tauri::command]
pub async fn push_to_registry(
    app: AppHandle,
    id: String,
    source: String,
    repository: String,
    tag: String,
) -> Result<String, String> {
    let reg = registry::get(&id)?;
    let docker = docker::connect()?;
    docker::registry::push(&app, &docker, &reg, &source, &repository, &tag).await
}
