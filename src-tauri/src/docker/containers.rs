use bollard::container::{
    ListContainersOptions, RemoveContainerOptions, RestartContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::Docker;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone)]
pub struct ContainerSummary {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub status_text: String,
    pub ports: Vec<String>,
    pub created_at: String,
    pub project: Option<String>,
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

pub async fn list(docker: &Docker) -> Result<Vec<ContainerSummary>, String> {
    let mut filters: HashMap<String, Vec<String>> = HashMap::new();
    filters.insert("status".into(), vec![]);

    let options = ListContainersOptions::<String> {
        all: true,
        ..Default::default()
    };

    let containers = docker
        .list_containers(Some(options))
        .await
        .map_err(|e| e.to_string())?;

    Ok(containers
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

            let ports = c
                .ports
                .unwrap_or_default()
                .into_iter()
                .filter_map(|p| {
                    p.public_port
                        .map(|pub_port| format!("{}:{}", pub_port, p.private_port))
                })
                .collect();

            ContainerSummary {
                id: c.id.clone().unwrap_or_default(),
                name,
                image: c.image.unwrap_or_default(),
                status: normalize_state(c.state.as_deref().unwrap_or("created")),
                status_text: c.status.unwrap_or_default(),
                ports,
                created_at: c
                    .created
                    .map(|ts| chrono::DateTime::from_timestamp(ts, 0).unwrap_or_default().to_rfc3339())
                    .unwrap_or_default(),
                project,
                cpu_percent: 0.0,
                mem_percent: 0.0,
                mem_usage_mb: 0.0,
                mem_limit_mb: 0.0,
            }
        })
        .collect())
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
