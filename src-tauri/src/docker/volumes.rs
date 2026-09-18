use bollard::volume::RemoveVolumeOptions;
use bollard::Docker;
use serde::Serialize;

use super::containers;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VolumeSummary {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub in_use: bool,
}

pub async fn list(docker: &Docker) -> Result<Vec<VolumeSummary>, String> {
    let response = docker.list_volumes::<String>(None).await.map_err(|e| e.to_string())?;
    let used = containers::volumes_in_use(docker).await?;

    Ok(response
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| VolumeSummary {
            in_use: used.contains(&v.name),
            name: v.name,
            driver: v.driver,
            mountpoint: v.mountpoint,
        })
        .collect())
}

pub async fn remove(docker: &Docker, name: &str) -> Result<(), String> {
    docker
        .remove_volume(name, Some(RemoveVolumeOptions { force: true }))
        .await
        .map_err(|e| e.to_string())
}
