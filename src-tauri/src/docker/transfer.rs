//! Copies images, volumes and containers from one engine to another (used by the migration queue).

use std::collections::HashMap;
use std::future::ready;
use std::sync::{Arc, Mutex};

use bollard::container::{
    Config, CreateContainerOptions, DownloadFromContainerOptions, RemoveContainerOptions, StopContainerOptions,
    UploadToContainerOptions,
};
use bollard::errors::Error as DockerError;
use bollard::image::{CreateImageOptions, ImportImageOptions, ListImagesOptions, RemoveImageOptions, TagImageOptions};
use bollard::models::{HostConfig, MountPointTypeEnum};
use bollard::volume::{CreateVolumeOptions, RemoveVolumeOptions};
use bollard::Docker;
use bytes::Bytes;
use futures_util::{Stream, StreamExt};

/// Reports how many bytes went through so far.
pub type Progress = Arc<dyn Fn(u64) + Send + Sync>;
pub type Cancelled = Arc<dyn Fn() -> bool + Send + Sync>;

pub enum Outcome {
    Copied(String),
    /// Something with that name is already on the destination, nothing was written.
    Existing(String),
}

const DATA_DIR: &str = "/data";

/// Turns a Docker byte stream into the plain `Bytes` stream the upload APIs want. A failure (or a
/// cancellation) ends the stream early and is recorded in `failure` for the caller to report.
fn bridge(
    stream: impl Stream<Item = Result<Bytes, DockerError>> + Send + 'static,
    failure: Arc<Mutex<Option<String>>>,
    progress: Progress,
    cancelled: Cancelled,
) -> impl Stream<Item = Bytes> + Send + 'static {
    stream.scan(0u64, move |total, chunk| {
        let next = match chunk {
            Ok(_) if cancelled() => {
                *failure.lock().unwrap() = Some("Cancelled.".into());
                None
            }
            Ok(bytes) => {
                *total += bytes.len() as u64;
                progress(*total);
                Some(bytes)
            }
            Err(e) => {
                *failure.lock().unwrap() = Some(e.to_string());
                None
            }
        };
        ready(next)
    })
}

fn take_failure(failure: &Arc<Mutex<Option<String>>>) -> Option<String> {
    failure.lock().unwrap().take()
}

pub async fn copy_image(
    src: &Docker,
    dst: &Docker,
    id: &str,
    progress: Progress,
    cancelled: Cancelled,
) -> Result<Outcome, String> {
    let info = src.inspect_image(id).await.map_err(|e| e.to_string())?;
    let full_id = info.id.clone().unwrap_or_else(|| id.to_string());
    let tags: Vec<String> = info.repo_tags.clone().unwrap_or_default();

    if let Ok(existing) = dst.inspect_image(&full_id).await {
        // Same image, but it may be missing some of the tags it carries here.
        let have = existing.repo_tags.unwrap_or_default();
        for tag in tags.iter().filter(|t| !have.contains(t)) {
            let (repo, name) = split_tag(tag);
            let _ = dst
                .tag_image(&full_id, Some(TagImageOptions { repo, tag: name }))
                .await;
        }
        return Ok(Outcome::Existing("Already on the destination".into()));
    }

    let failure = Arc::new(Mutex::new(None));
    // Untagged images are exported by id.
    let names: Vec<&str> = if tags.is_empty() {
        vec![full_id.as_str()]
    } else {
        tags.iter().map(String::as_str).collect()
    };
    let source = bridge(src.export_images(&names), failure.clone(), progress, cancelled);

    let mut loading = Box::pin(dst.import_image_stream(ImportImageOptions { quiet: true }, source, None));
    while let Some(step) = loading.next().await {
        let step = step.map_err(|e| e.to_string())?;
        if let Some(error) = step.error {
            return Err(error);
        }
    }
    if let Some(error) = take_failure(&failure) {
        return Err(error);
    }
    Ok(Outcome::Copied("Copied".into()))
}

fn split_tag(reference: &str) -> (String, String) {
    match reference.rfind(':') {
        Some(i) if !reference[i..].contains('/') => (reference[..i].to_string(), reference[i + 1..].to_string()),
        _ => (reference.to_string(), "latest".to_string()),
    }
}

/// Any image already present on the engine is good enough to hang a throwaway container on (it is
/// only created, never started); the smallest one is the cheapest. Pulls busybox if there is none.
async fn helper_image(docker: &Docker) -> Result<String, String> {
    let images = docker
        .list_images(Some(ListImagesOptions::<String> {
            all: false,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;
    let smallest = images
        .into_iter()
        .filter(|i| i.repo_tags.iter().any(|t| !t.starts_with("<none>")))
        .min_by_key(|i| i.size);
    if let Some(image) = smallest {
        return Ok(image.id);
    }
    let mut pulling = docker.create_image(
        Some(CreateImageOptions {
            from_image: "busybox",
            tag: "latest",
            ..Default::default()
        }),
        None,
        None,
    );
    while let Some(step) = pulling.next().await {
        step.map_err(|e| format!("Could not pull the helper image busybox: {e}"))?;
    }
    Ok("busybox:latest".into())
}

/// A container that exists only to expose a volume to the archive API.
async fn scratch_container(docker: &Docker, volume: &str, read_only: bool) -> Result<String, String> {
    let image = helper_image(docker).await?;
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let bind = format!("{volume}:{DATA_DIR}{}", if read_only { ":ro" } else { "" });
    let created = docker
        .create_container(
            Some(CreateContainerOptions {
                name: format!("portus-migrate-{suffix}"),
                platform: None,
            }),
            Config {
                image: Some(image),
                host_config: Some(HostConfig {
                    binds: Some(vec![bind]),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(created.id)
}

async fn discard_container(docker: &Docker, id: &str) {
    let _ = docker
        .remove_container(
            id,
            Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }),
        )
        .await;
}

pub async fn copy_volume(
    src: &Docker,
    dst: &Docker,
    name: &str,
    progress: Progress,
    cancelled: Cancelled,
) -> Result<Outcome, String> {
    if dst.inspect_volume(name).await.is_ok() {
        return Ok(Outcome::Existing("A volume with this name is already on the destination".into()));
    }
    let info = src.inspect_volume(name).await.map_err(|e| e.to_string())?;
    if info.driver != "local" {
        return Err(format!("Only volumes of the local driver can be copied (this one uses {}).", info.driver));
    }

    dst.create_volume(CreateVolumeOptions {
        name: name.to_string(),
        driver: "local".to_string(),
        labels: info.labels.clone(),
        ..Default::default()
    })
    .await
    .map_err(|e| e.to_string())?;

    let result = pipe_volume(src, dst, name, progress, cancelled).await;
    if result.is_err() {
        // Never leave a half-filled volume behind: a retry would then see it as a duplicate.
        let _ = dst.remove_volume(name, Some(RemoveVolumeOptions { force: true })).await;
    }
    result.map(|_| Outcome::Copied("Copied".into()))
}

async fn pipe_volume(
    src: &Docker,
    dst: &Docker,
    name: &str,
    progress: Progress,
    cancelled: Cancelled,
) -> Result<(), String> {
    let from = scratch_container(src, name, true).await?;
    let to = match scratch_container(dst, name, false).await {
        Ok(id) => id,
        Err(e) => {
            discard_container(src, &from).await;
            return Err(e);
        }
    };

    let failure = Arc::new(Mutex::new(None));
    let tar = bridge(
        src.download_from_container(
            &from,
            Some(DownloadFromContainerOptions {
                path: format!("{DATA_DIR}/."),
            }),
        ),
        failure.clone(),
        progress,
        cancelled,
    );
    let uploaded = dst
        .upload_to_container_streaming(
            &to,
            Some(UploadToContainerOptions {
                path: DATA_DIR.to_string(),
                no_overwrite_dir_non_dir: "false".to_string(),
            }),
            tar,
        )
        .await
        .map_err(|e| e.to_string());

    discard_container(src, &from).await;
    discard_container(dst, &to).await;
    uploaded?;
    match take_failure(&failure) {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

pub async fn copy_container(src: &Docker, dst: &Docker, id: &str) -> Result<Outcome, String> {
    let info = src.inspect_container(id, None).await.map_err(|e| e.to_string())?;
    let name = info.name.clone().unwrap_or_default().trim_start_matches('/').to_string();
    if name.is_empty() {
        return Err("The container has no name.".into());
    }
    if dst.inspect_container(&name, None).await.is_ok() {
        return Ok(Outcome::Existing("A container with this name is already on the destination".into()));
    }

    let cfg = info.config.clone().unwrap_or_default();
    let mut host = info.host_config.clone().unwrap_or_default();
    let mut notes: Vec<String> = Vec::new();

    // Image: by name when the destination knows it, otherwise by the id it was copied under.
    let by_name = match &cfg.image {
        Some(reference) if dst.inspect_image(reference).await.is_ok() => Some(reference.clone()),
        _ => None,
    };
    let image = match by_name {
        Some(reference) => reference,
        None => {
            let image_id = info.image.clone().unwrap_or_default();
            if image_id.is_empty() || dst.inspect_image(&image_id).await.is_err() {
                return Err(format!(
                    "Its image ({}) is not on the destination: include the image in the migration.",
                    cfg.image.clone().unwrap_or(image_id)
                ));
            }
            image_id
        }
    };

    // Named and anonymous volumes become explicit binds so they keep pointing at the copied data.
    let mut binds = host.binds.take().unwrap_or_default();
    let mut volumes = cfg.volumes.clone().unwrap_or_default();
    for mount in info.mounts.clone().unwrap_or_default() {
        if mount.typ != Some(MountPointTypeEnum::VOLUME) {
            continue;
        }
        let (Some(volume), Some(target)) = (mount.name, mount.destination) else {
            continue;
        };
        if dst.inspect_volume(&volume).await.is_err() {
            return Err(format!("Its volume {volume} is not on the destination: include it in the migration."));
        }
        volumes.remove(&target);
        if !binds.iter().any(|b| b.split(':').nth(1) == Some(target.as_str())) {
            let mode = if mount.rw == Some(false) { ":ro" } else { "" };
            binds.push(format!("{volume}:{target}{mode}"));
        }
    }
    if !binds.is_empty() {
        host.binds = Some(binds);
    }

    // Custom networks are not migrated: fall back to the default bridge.
    if let Some(mode) = host.network_mode.clone() {
        let portable = matches!(mode.as_str(), "default" | "bridge" | "host" | "none") || mode.starts_with("container:");
        if !portable {
            host.network_mode = None;
            notes.push(format!("network {mode} is not migrated, it uses the default bridge"));
        }
    }
    if info
        .mounts
        .as_ref()
        .is_some_and(|m| m.iter().any(|m| m.typ == Some(MountPointTypeEnum::BIND)))
    {
        notes.push("it has bind mounts, check that those paths exist on the destination".into());
    }

    let config: Config<String> = Config {
        hostname: cfg.hostname,
        domainname: cfg.domainname,
        user: cfg.user,
        attach_stdin: cfg.attach_stdin,
        attach_stdout: cfg.attach_stdout,
        attach_stderr: cfg.attach_stderr,
        exposed_ports: cfg.exposed_ports,
        tty: cfg.tty,
        open_stdin: cfg.open_stdin,
        stdin_once: cfg.stdin_once,
        env: cfg.env,
        cmd: cfg.cmd,
        healthcheck: cfg.healthcheck,
        args_escaped: cfg.args_escaped,
        image: Some(image),
        volumes: if volumes.is_empty() { None } else { Some(volumes) },
        working_dir: cfg.working_dir,
        entrypoint: cfg.entrypoint,
        network_disabled: cfg.network_disabled,
        mac_address: None,
        on_build: cfg.on_build,
        labels: cfg.labels.map(|l| l.into_iter().collect::<HashMap<_, _>>()),
        stop_signal: cfg.stop_signal,
        stop_timeout: cfg.stop_timeout,
        shell: cfg.shell,
        host_config: Some(host),
        networking_config: None,
    };

    dst.create_container(
        Some(CreateContainerOptions {
            name: name.clone(),
            platform: None,
        }),
        config,
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut message = "Created (not started)".to_string();
    if !notes.is_empty() {
        message = format!("{message}; {}", notes.join("; "));
    }
    Ok(Outcome::Copied(message))
}

pub async fn stop_container(docker: &Docker, id: &str) {
    let _ = docker.stop_container(id, None::<StopContainerOptions>).await;
}

/// Source cleanup once a move succeeded: never forced, so anything still in use stays put.
pub async fn remove_container(docker: &Docker, id: &str) -> Result<(), String> {
    docker
        .remove_container(id, None::<RemoveContainerOptions>)
        .await
        .map_err(|e| e.to_string())
}

pub async fn remove_volume(docker: &Docker, name: &str) -> Result<(), String> {
    docker
        .remove_volume(name, Some(RemoveVolumeOptions { force: false }))
        .await
        .map_err(|e| e.to_string())
}

pub async fn remove_image(docker: &Docker, id: &str) -> Result<(), String> {
    docker
        .remove_image(id, Some(RemoveImageOptions::default()), None)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}
