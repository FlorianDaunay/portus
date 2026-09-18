use bollard::image::{ListImagesOptions, RemoveImageOptions};
use bollard::Docker;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct ImageSummary {
    pub id: String,
    pub repo_tag: String,
    pub size_mb: f64,
    pub created_at: String,
    pub in_use: bool,
}

pub async fn list(docker: &Docker) -> Result<Vec<ImageSummary>, String> {
    let images = docker
        .list_images(Some(ListImagesOptions::<String> {
            all: false,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    Ok(images
        .into_iter()
        .map(|img| ImageSummary {
            id: img.id.clone(),
            repo_tag: img
                .repo_tags
                .first()
                .cloned()
                .unwrap_or_else(|| "<none>:<none>".to_string()),
            size_mb: img.size as f64 / (1024.0 * 1024.0),
            created_at: chrono::DateTime::from_timestamp(img.created, 0)
                .unwrap_or_default()
                .to_rfc3339(),
            in_use: img.containers > 0,
        })
        .collect())
}

pub async fn remove(docker: &Docker, id: &str) -> Result<(), String> {
    docker
        .remove_image(id, Some(RemoveImageOptions::default()), None)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}
