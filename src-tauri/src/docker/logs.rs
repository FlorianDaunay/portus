use bollard::container::LogsOptions;
use bollard::Docker;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
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

/// Docker prefixes each line with an RFC3339 timestamp when `timestamps: true`
/// is set, separated from the message by the first space. Splits that out.
fn split_timestamp(line: &str) -> (String, String) {
    match line.split_once(' ') {
        Some((ts, rest)) if chrono::DateTime::parse_from_rfc3339(ts).is_ok() => {
            (ts.to_string(), rest.to_string())
        }
        _ => (chrono::Utc::now().to_rfc3339(), line.to_string()),
    }
}

fn to_lines(container_id: &str, container_name: &str, raw: &str) -> Vec<LogLine> {
    raw.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let (timestamp, message) = split_timestamp(line);
            LogLine {
                container_id: container_id.to_string(),
                container_name: container_name.to_string(),
                level: guess_level(&message),
                timestamp,
                message,
            }
        })
        .collect()
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
            lines.extend(to_lines(container_id, container_name, &log_output.to_string()));
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
                for line in to_lines(&container_id, &container_name, &log_output.to_string()) {
                    let _ = app.emit("container-log", &line);
                }
            }
            Err(e) => {
                let _ = app.emit("container-log-error", e.to_string());
                break;
            }
        }
    }

    Ok(())
}
