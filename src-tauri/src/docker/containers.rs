use bollard::container::{
    Config, CreateContainerOptions, ListContainersOptions, RemoveContainerOptions, RestartContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::secret::{HostConfig, MountPointTypeEnum, PortBinding};
use bollard::Docker;
use futures_util::future::join_all;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

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

/// Parses `[host_ip:]host_port:container_port[/proto]` (or just `container_port`) into the
/// exposed port key (`80/tcp`) and its host binding (none when only the container port is given).
fn parse_port(spec: &str) -> Result<(String, Option<PortBinding>), String> {
    let invalid = || format!("Invalid port mapping \"{spec}\": use hostPort:containerPort, e.g. 8080:80.");
    let (mapping, proto) = spec.split_once('/').unwrap_or((spec, "tcp"));
    if !matches!(proto, "tcp" | "udp" | "sctp") {
        return Err(invalid());
    }
    let parts: Vec<&str> = mapping.split(':').collect();
    let (host_ip, host_port, container_port) = match parts.as_slice() {
        [container] => (None, None, *container),
        [host, container] => (None, Some(*host), *container),
        [ip, host, container] => (Some(*ip), Some(*host), *container),
        _ => return Err(invalid()),
    };
    if container_port.parse::<u16>().is_err() || host_port.is_some_and(|p| !p.is_empty() && p.parse::<u16>().is_err()) {
        return Err(invalid());
    }
    let binding = host_port.map(|p| PortBinding {
        host_ip: host_ip.map(str::to_string),
        host_port: Some(p.to_string()),
    });
    Ok((format!("{container_port}/{proto}"), binding))
}

/// Creates a container from an image (optionally starting it) and returns its id.
pub async fn create(
    docker: &Docker,
    image: &str,
    name: Option<String>,
    ports: Vec<String>,
    env: Vec<String>,
    start_after: bool,
) -> Result<String, String> {
    let mut exposed: HashMap<String, HashMap<(), ()>> = HashMap::new();
    let mut bindings: HashMap<String, Option<Vec<PortBinding>>> = HashMap::new();
    for spec in ports.iter().map(|p| p.trim()).filter(|p| !p.is_empty()) {
        let (key, binding) = parse_port(spec)?;
        exposed.insert(key.clone(), HashMap::new());
        if let Some(binding) = binding {
            bindings.entry(key).or_insert_with(|| Some(Vec::new())).get_or_insert_with(Vec::new).push(binding);
        }
    }
    let env: Vec<String> = env.into_iter().map(|e| e.trim().to_string()).filter(|e| !e.is_empty()).collect();
    let name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());

    let created = docker
        .create_container(
            name.map(|name| CreateContainerOptions { name, platform: None }),
            Config {
                image: Some(image.to_string()),
                exposed_ports: Some(exposed),
                env: (!env.is_empty()).then_some(env),
                host_config: Some(HostConfig {
                    port_bindings: (!bindings.is_empty()).then_some(bindings),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    if start_after {
        start(docker, &created.id).await?;
    }
    Ok(created.id)
}
