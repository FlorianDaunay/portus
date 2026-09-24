//! Runs `docker ...` command lines typed in the console page against the engine in use and
//! streams the output to the frontend (`console-output`, then `console-exit`).

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::oneshot;

use crate::docker::engine;

#[derive(Default)]
pub struct ConsoleManager {
    /// Kill switches of the commands still running, by run id.
    running: Arc<Mutex<HashMap<u64, oneshot::Sender<()>>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Output {
    run_id: u64,
    /// `out` or `err`.
    stream: &'static str,
    line: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Exit {
    run_id: u64,
    code: Option<i32>,
}

/// Splits a command line the way a shell would for quotes, without interpreting anything else
/// (no pipes, variables or globbing). A backslash only escapes a quote inside double quotes, so
/// Windows paths survive.
pub fn split_args(line: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut started = false;
    let mut quote: Option<char> = None;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (None, ' ' | '\t') => {
                if started {
                    args.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            (None, '\'' | '"') => {
                quote = Some(c);
                started = true;
            }
            (Some(q), c) if c == q => quote = None,
            (Some('"'), '\\') if matches!(chars.peek(), Some('"' | '\\')) => current.push(chars.next().unwrap()),
            (_, c) => {
                current.push(c);
                started = true;
            }
        }
    }
    if quote.is_some() {
        return Err("Unclosed quote.".into());
    }
    if started {
        args.push(current);
    }
    Ok(args)
}

impl ConsoleManager {
    pub fn run(&self, app: &AppHandle, run_id: u64, line: &str) -> Result<(), String> {
        let mut args = split_args(line)?;
        if args.first().map(String::as_str) != Some("docker") {
            return Err("Only docker commands can be run here: start with `docker`.".into());
        }
        args.remove(0);
        if args.is_empty() {
            return Err("Type a docker command, for example `docker ps`.".into());
        }

        let mut cmd = engine::cli_command()?;
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "The docker command-line tool was not found on this computer (it is not in the PATH).".to_string()
            } else {
                e.to_string()
            }
        })?;

        let (kill, killed) = oneshot::channel();
        self.running.lock().unwrap().insert(run_id, kill);

        let out = child.stdout.take().map(|s| forward(app.clone(), run_id, "out", s));
        let err = child.stderr.take().map(|s| forward(app.clone(), run_id, "err", s));
        let running = self.running.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let status = tokio::select! {
                status = child.wait() => status.ok(),
                _ = killed => {
                    let _ = child.kill().await;
                    child.wait().await.ok()
                }
            };
            for task in [out, err].into_iter().flatten() {
                let _ = task.await;
            }
            running.lock().unwrap().remove(&run_id);
            let _ = app.emit(
                "console-exit",
                Exit {
                    run_id,
                    code: status.and_then(|s| s.code()),
                },
            );
        });
        Ok(())
    }

    pub fn cancel(&self, run_id: u64) {
        if let Some(kill) = self.running.lock().unwrap().remove(&run_id) {
            let _ = kill.send(());
        }
    }
}

fn forward(
    app: AppHandle,
    run_id: u64,
    stream: &'static str,
    reader: impl AsyncRead + Unpin + Send + 'static,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit("console-output", Output { run_id, stream, line });
        }
    })
}

#[cfg(test)]
mod tests {
    use super::split_args;

    #[test]
    fn splits_plain_and_quoted_words() {
        assert_eq!(split_args("docker ps -a").unwrap(), ["docker", "ps", "-a"]);
        assert_eq!(
            split_args(r#"docker run --name "my app" -e 'A=b c' nginx"#).unwrap(),
            ["docker", "run", "--name", "my app", "-e", "A=b c", "nginx"]
        );
    }

    #[test]
    fn keeps_windows_paths_and_empty_arguments() {
        assert_eq!(split_args(r"docker cp x C:\temp\f").unwrap(), ["docker", "cp", "x", r"C:\temp\f"]);
        assert_eq!(split_args(r#"docker run -e A="" x"#).unwrap(), ["docker", "run", "-e", "A=", "x"]);
        assert_eq!(split_args(r#"echo "" x"#).unwrap(), ["echo", "", "x"]);
    }

    #[test]
    fn rejects_unclosed_quotes() {
        assert!(split_args("docker run 'x").is_err());
    }
}
