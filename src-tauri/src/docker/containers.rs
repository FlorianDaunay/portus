use bollard::container::{
    ListContainersOptions, RemoveContainerOptions, RestartContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::secret::MountPointTypeEnum;
use bollard::Docker;
use futures_util::future::join_all;
use serde::Serialize;
use std::collections::HashSet;

use super::stats;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContainerSummary {
    pub id: String,
    pub name: String,
    pub image: String,
    pub image_id: String,
    pub status: String,
    pub status_text: String,
    pub ports: Vec<String>,
    pub created_at: String,
    pub project: Option<String>,
    /// Names of the named volumes mounted into the container.
    pub volumes: Vec<String>,
    pub cpu_percent: f64,
    pub mem_percent: f64,
    pub mem_usage_mb: f64,
    pub mem_limit_mb: f64,
}

fn normalize_state(state: &str) -> String {
    match state {
        "running" => "running",
        "exited" => "exited",
        "paused" => "paused",
        "restarting" => "restarting",
        _ => "created",
    }
    .to_string()
}

/// Names of volumes currently mounted into at least one container.
pub async fn volumes_in_use(docker: &Docker) -> Result<HashSet<String>, String> {
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    Ok(containers
        .into_iter()
        .flat_map(|c| c.mounts.unwrap_or_default())
        .filter(|m| m.typ == Some(MountPointTypeEnum::VOLUME))
        .filter_map(|m| m.name)
        .collect())
}

/// Image references (both full IDs and repo:tag names) currently used by a container.
pub async fn images_in_use(docker: &Docker) -> Result<HashSet<String>, String> {
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    let mut refs = HashSet::new();
    for c in containers {
        if let Some(image) = c.image {
            refs.insert(image);
        }
        if let Some(image_id) = c.image_id {
            refs.insert(image_id);
        }
    }
    Ok(refs)
}

pub async fn list(docker: &Docker) -> Result<Vec<ContainerSummary>, String> {
    let options = ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    };

    let containers = docker
        .list_containers(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    let mut summaries: Vec<ContainerSummary> = containers
        .into_iter()
        .map(|c| {
            let name = c
                .names
                .as_ref()
                .and_then(|n| n.first())
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_else(|| c.id.clone().unwrap_or_default().chars().take(12).collect());

            let labels = c.labels.unwrap_or_default();
            let project = labels.get("com.docker.compose.project").cloned();

            let volumes: Vec<String> = c
                .mounts
                .unwrap_or_default()
                .into_iter()
                .filter(|m| m.typ == Some(MountPointTypeEnum::VOLUME))
                .filter_map(|m| m.name)
                .collect();

            let mut ports: Vec<String> = Vec::new();
            for p in c.ports.unwrap_or_default() {
                if let Some(public) = p.public_port {
                    let mapping = format!("{}:{}", public, p.private_port);
                    if !ports.contains(&mapping) {
                        ports.push(mapping);
                    }
                }
            }

            ContainerSummary {
                id: c.id.clone().unwrap_or_default(),
                name,
                image: c.image.unwrap_or_default(),
                image_id: c.image_id.unwrap_or_default(),
                status: normalize_state(c.state.as_deref().unwrap_or("created")),
                status_text: c.status.unwrap_or_default(),
                ports,
                created_at: c
                    .created
                    .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
                project,
                volumes,
                cpu_percent: 0.0,
                mem_percent: 0.0,
                mem_usage_mb: 0.0,
                mem_limit_mb: 0.0,
            }
        })
        .collect();

    let running_ids: Vec<String> = summaries
        .iter()
        .filter(|c| c.status == "running")
        .map(|c| c.id.clone())
        .collect();

    let usages = join_all(running_ids.iter().map(|id| stats::usage(docker, id))).await;

    for (id, usage) in running_ids.into_iter().zip(usages) {
        if let Some(c) = summaries.iter_mut().find(|c| c.id == id) {
            c.cpu_percent = usage.cpu_percent;
            c.mem_usage_mb = usage.mem_usage_bytes as f64 / (1024.0 * 1024.0);
            c.mem_limit_mb = usage.mem_limit_bytes as f64 / (1024.0 * 1024.0);
            c.mem_percent = if usage.mem_limit_bytes > 0 {
                (usage.mem_usage_bytes as f64 / usage.mem_limit_bytes as f64) * 100.0
            } else {
                0.0
            };
        }
    }

    Ok(summaries)
}

pub async fn start(docker: &Docker, id: &str) -> Result<(), String> {
    docker
        .start_container(id, None::<StartContainerOptions<String>>)
        .await
        .map_err(|e| e.to_string())
}

pub async fn stop(docker: &Docker, id: &str) -> Result<(), String> {
    docker
        .stop_container(id, None::<StopContainerOptions>)
        .await
        .map_err(|e| e.to_string())
}

pub async fn restart(docker: &Docker, id: &str) -> Result<(), String> {
    docker
        .restart_container(id, None::<RestartContainerOptions>)
        .await
        .map_err(|e| e.to_string())
}

pub async fn remove(docker: &Docker, id: &str) -> Result<(), String> {
    docker
        .remove_container(
            id,
            Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }),
        )
        .await
        .map_err(|e| e.to_string())
}
