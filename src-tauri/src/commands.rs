use crate::docker;
use crate::docker::compose::ComposeProject;
use crate::docker::containers::ContainerSummary;
use crate::docker::images::ImageSummary;
use crate::docker::volumes::VolumeSummary;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, Clone)]
pub struct DaemonInfo {
    pub connected: bool,
    pub version: String,
    pub containers_running: usize,
    pub containers_stopped: usize,
    pub images: usize,
    pub disk_usage_mb: f64,
}

#[tauri::command]
pub async fn get_daemon_info() -> Result<DaemonInfo, String> {
    let docker = docker::connect()?;
    let version = docker.version().await.map_err(|e| e.to_string())?;
    let containers = docker::containers::list(&docker).await?;
    let images = docker::images::list(&docker).await?;
    let volumes = docker::volumes::list(&docker).await?;

    let running = containers.iter().filter(|c| c.status == "running").count();
    let stopped = containers.len() - running;
    let disk_usage_mb = images.iter().map(|i| i.size_mb).sum::<f64>()
        + volumes.iter().map(|v| v.size_mb).sum::<f64>();

    Ok(DaemonInfo {
        connected: true,
        version: version.version.unwrap_or_default(),
        containers_running: running,
        containers_stopped: stopped,
        images: images.len(),
        disk_usage_mb,
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
