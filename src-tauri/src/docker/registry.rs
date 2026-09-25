use bollard::auth::DockerCredentials;
use bollard::image::{CreateImageOptions, PushImageOptions, TagImageOptions};
use bollard::Docker;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::registry::{Kind, Registry};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    op: &'static str,
    reference: String,
    id: Option<String>,
    status: String,
    progress: Option<String>,
}

fn credentials(reg: &Registry) -> Option<DockerCredentials> {
    if reg.username.is_empty() {
        return None;
    }
    Some(DockerCredentials {
        username: Some(reg.username.clone()),
        password: Some(reg.password.clone()),
        serveraddress: Some(if reg.kind == Kind::Hub { "https://index.docker.io/v1/".into() } else { reg.host() }),
        ..Default::default()
    })
}

fn emit(app: &AppHandle, op: &'static str, reference: &str, id: Option<String>, status: Option<String>, progress: Option<String>) {
    if let Some(status) = status {
        let _ = app.emit("registry-progress", Progress { op, reference: reference.to_string(), id, status, progress });
    }
}

/// Pulls `repository:tag` from the registry into the engine.
pub async fn pull(app: &AppHandle, docker: &Docker, reg: &Registry, repository: &str, tag: &str) -> Result<String, String> {
    let name = reg.image_name(repository);
    let reference = format!("{name}:{tag}");
    let options = CreateImageOptions { from_image: name, tag: tag.to_string(), ..Default::default() };
    let mut stream = docker.create_image(Some(options), None, credentials(reg));
    while let Some(item) = stream.next().await {
        let info = item.map_err(|e| e.to_string())?;
        if let Some(error) = info.error {
            return Err(error);
        }
        emit(app, "pull", &reference, info.id, info.status, info.progress);
    }
    Ok(reference)
}

/// Tags a local image as `repository:tag` of the registry and pushes it.
pub async fn push(
    app: &AppHandle,
    docker: &Docker,
    reg: &Registry,
    source: &str,
    repository: &str,
    tag: &str,
) -> Result<String, String> {
    if reg.username.is_empty() {
        return Err("Pushing needs credentials: add a username and password to this registry first.".into());
    }
    let name = reg.image_name(repository);
    let reference = format!("{name}:{tag}");
    docker
        .tag_image(source, Some(TagImageOptions { repo: name.clone(), tag: tag.to_string() }))
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = docker.push_image(&name, Some(PushImageOptions { tag: tag.to_string() }), credentials(reg));
    while let Some(item) = stream.next().await {
        let info = item.map_err(|e| e.to_string())?;
        if let Some(error) = info.error {
            return Err(error);
        }
        emit(app, "push", &reference, None, info.status, info.progress);
    }
    Ok(reference)
}
