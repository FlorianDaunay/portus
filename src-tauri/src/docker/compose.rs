use bollard::container::ListContainersOptions;
use bollard::Docker;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize, Clone)]
pub struct ComposeService {
    pub name: String,
    pub status: String,
    pub image: String,
    pub ports: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct ComposeProject {
    pub name: String,
    pub config_path: String,
    pub services: Vec<ComposeService>,
}

pub async fn list(docker: &Docker) -> Result<Vec<ComposeProject>, String> {
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    let mut projects: BTreeMap<String, (String, Vec<ComposeService>)> = BTreeMap::new();

    for c in containers {
        let labels = c.labels.clone().unwrap_or_default();
        let Some(project) = labels.get("com.docker.compose.project").cloned() else {
            continue;
        };
        let config_path = labels
            .get("com.docker.compose.project.config_files")
            .cloned()
            .unwrap_or_default();
        let service_name = labels
            .get("com.docker.compose.service")
            .cloned()
            .unwrap_or_else(|| c.image.clone().unwrap_or_default());

        let status = match c.state.as_deref() {
            Some("running") => "running",
            Some("paused") => "paused",
            Some("restarting") => "restarting",
            Some("exited") => "exited",
            _ => "created",
        }
        .to_string();

        let ports = c
            .ports
            .unwrap_or_default()
            .into_iter()
            .filter_map(|p| p.public_port.map(|pub_port| format!("{}:{}", pub_port, p.private_port)))
            .collect();

        let entry = projects.entry(project).or_insert_with(|| (config_path, vec![]));
        entry.1.push(ComposeService {
            name: service_name,
            status,
            image: c.image.unwrap_or_default(),
            ports,
        });
    }

    Ok(projects
        .into_iter()
        .map(|(name, (config_path, services))| ComposeProject {
            name,
            config_path,
            services,
        })
        .collect())
}
