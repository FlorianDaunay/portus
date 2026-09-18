use bollard::container::LogsOptions;
use bollard::Docker;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
pub struct LogLine {
    pub container_id: String,
    pub container_name: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

fn guess_level(message: &str) -> String {
    let lower = message.to_lowercase();
    if lower.contains("error") || lower.contains("fatal") {
        "error".to_string()
    } else if lower.contains("warn") {
        "warn".to_string()
    } else {
        "info".to_string()
    }
}

pub async fn recent(docker: &Docker, container_id: &str, container_name: &str) -> Vec<LogLine> {
    let options = LogsOptions::<String> {
        follow: false,
        stdout: true,
        stderr: true,
        tail: "20".to_string(),
        timestamps: true,
        ..Default::default()
    };

    let mut stream = docker.logs(container_id, Some(options));
    let mut lines = Vec::new();

    while let Some(chunk) = stream.next().await {
        if let Ok(log_output) = chunk {
            let message = log_output.to_string();
            lines.push(LogLine {
                container_id: container_id.to_string(),
                container_name: container_name.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: guess_level(&message),
                message,
            });
        }
    }

    lines
}

pub async fn stream_to_frontend(
    docker: &Docker,
    app: AppHandle,
    container_id: String,
    container_name: String,
) -> Result<(), String> {
    let options = LogsOptions::<String> {
        follow: true,
        stdout: true,
        stderr: true,
        tail: "100".to_string(),
        timestamps: true,
        ..Default::default()
    };

    let mut stream = docker.logs(&container_id, Some(options));

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(log_output) => {
                let message = log_output.to_string();
                let line = LogLine {
                    container_id: container_id.clone(),
                    container_name: container_name.clone(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    level: guess_level(&message),
                    message,
                };
                let _ = app.emit("container-log", &line);
            }
            Err(e) => {
                let _ = app.emit("container-log-error", e.to_string());
                break;
            }
        }
    }

    Ok(())
}
