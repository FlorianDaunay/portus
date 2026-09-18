use bollard::image::{ListImagesOptions, RemoveImageOptions};
use bollard::Docker;
use serde::Serialize;

use super::containers;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
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

    let used_refs = containers::images_in_use(docker).await?;

    Ok(images
        .into_iter()
        .map(|img| {
            let repo_tag = img
                .repo_tags
                .first()
                .cloned()
                .unwrap_or_else(|| "<none>:<none>".to_string());
            let in_use = used_refs.contains(&img.id) || used_refs.contains(&repo_tag);

            ImageSummary {
                id: img.id,
                repo_tag,
                size_mb: img.size as f64 / (1024.0 * 1024.0),
                created_at: chrono::DateTime::from_timestamp(img.created, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
                in_use,
            }
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
