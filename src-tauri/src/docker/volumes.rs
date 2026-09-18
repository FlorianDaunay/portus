use bollard::volume::RemoveVolumeOptions;
use bollard::Docker;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct VolumeSummary {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub size_mb: f64,
    pub in_use: bool,
}

pub async fn list(docker: &Docker) -> Result<Vec<VolumeSummary>, String> {
    let response = docker.list_volumes::<String>(None).await.map_err(|e| e.to_string())?;

    Ok(response
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| {
            let usage = v.usage_data.as_ref();
            VolumeSummary {
                name: v.name,
                driver: v.driver,
                mountpoint: v.mountpoint,
                size_mb: usage.map(|u| u.size as f64 / (1024.0 * 1024.0)).unwrap_or(0.0),
                in_use: usage.map(|u| u.ref_count > 0).unwrap_or(false),
            }
        })
        .collect())
}

pub async fn remove(docker: &Docker, name: &str) -> Result<(), String> {
    docker
        .remove_volume(name, Some(RemoveVolumeOptions { force: true }))
        .await
        .map_err(|e| e.to_string())
}
