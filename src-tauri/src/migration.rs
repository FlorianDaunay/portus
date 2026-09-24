//! Queue of migrations between engines: jobs run one at a time in the background, their state is
//! pushed to the frontend as `migration-update` events and the last ones are kept as a history.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::docker::engine;
use crate::docker::transfer::{self, Cancelled, Outcome, Progress};
use crate::settings;

const MAX_HISTORY: usize = 50;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Container,
    Image,
    Volume,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// Leave the source untouched.
    Copy,
    /// Remove from the source what was copied successfully.
    Move,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ItemStatus {
    Pending,
    Running,
    Done,
    /// Already on the destination, or not attempted after a cancellation.
    Skipped,
    Failed,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Queued,
    Running,
    Done,
    /// Some items failed, others went through.
    Partial,
    Failed,
    Cancelled,
    /// Portus was closed while it was queued or running.
    Interrupted,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub kind: Kind,
    pub id: String,
    pub label: String,
    pub status: ItemStatus,
    pub message: String,
    pub bytes: u64,
    /// Whether the copy actually wrote something (as opposed to finding it already there).
    #[serde(default)]
    pub transferred: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: u64,
    pub from: String,
    pub to: String,
    pub from_label: String,
    pub to_label: String,
    pub mode: Mode,
    pub status: JobStatus,
    pub message: String,
    pub items: Vec<Item>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestItem {
    pub kind: Kind,
    pub id: String,
    pub label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub from: String,
    pub to: String,
    pub from_label: String,
    pub to_label: String,
    pub mode: Mode,
    pub items: Vec<RequestItem>,
}

#[derive(Default)]
struct State {
    jobs: Vec<Job>,
    next_id: u64,
    cancelled: Vec<u64>,
}

#[derive(Default)]
struct Inner {
    state: Mutex<State>,
    worker: AtomicBool,
}

#[derive(Clone, Default)]
pub struct MigrationManager(Arc<Inner>);

fn history_path() -> PathBuf {
    settings::data_dir().join("migrations.json")
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl MigrationManager {
    /// Restores the history; whatever was queued or running when Portus last closed is marked as interrupted.
    pub fn load() -> Self {
        let mut jobs: Vec<Job> = std::fs::read_to_string(history_path())
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        for job in &mut jobs {
            if matches!(job.status, JobStatus::Queued | JobStatus::Running) {
                job.status = JobStatus::Interrupted;
                job.message = "Portus was closed before this migration finished.".into();
                job.finished_at = Some(now());
                for item in job.items.iter_mut().filter(|i| matches!(i.status, ItemStatus::Pending | ItemStatus::Running)) {
                    item.status = ItemStatus::Skipped;
                }
            }
        }
        let next_id = jobs.iter().map(|j| j.id).max().unwrap_or(0) + 1;
        MigrationManager(Arc::new(Inner {
            state: Mutex::new(State {
                jobs,
                next_id,
                cancelled: Vec::new(),
            }),
            worker: AtomicBool::new(false),
        }))
    }

    pub fn list(&self) -> Vec<Job> {
        self.0.state.lock().unwrap().jobs.clone()
    }

    /// Jobs queued or running (shown in the tray tooltip).
    pub fn active_count(&self) -> usize {
        self.0
            .state
            .lock()
            .unwrap()
            .jobs
            .iter()
            .filter(|j| matches!(j.status, JobStatus::Queued | JobStatus::Running))
            .count()
    }

    fn persist(state: &State) {
        let _ = std::fs::create_dir_all(settings::data_dir());
        if let Ok(text) = serde_json::to_string(&state.jobs) {
            let _ = std::fs::write(history_path(), text);
        }
    }

    /// Applies a change to a job and tells the frontend. `save` is off for the frequent progress ticks.
    fn update(&self, app: &AppHandle, id: u64, save: bool, change: impl FnOnce(&mut Job)) {
        let snapshot = {
            let mut state = self.0.state.lock().unwrap();
            let Some(job) = state.jobs.iter_mut().find(|j| j.id == id) else {
                return;
            };
            change(job);
            let snapshot = job.clone();
            if save {
                Self::persist(&state);
            }
            snapshot
        };
        let _ = app.emit("migration-update", snapshot);
    }

    fn is_cancelled(&self, id: u64) -> bool {
        self.0.state.lock().unwrap().cancelled.contains(&id)
    }

    pub fn enqueue(&self, app: &AppHandle, request: Request) -> Result<Job, String> {
        if request.from == request.to {
            return Err("Pick two different engines.".into());
        }
        if request.items.is_empty() {
            return Err("Select at least one image, volume or container.".into());
        }
        let job = {
            let mut state = self.0.state.lock().unwrap();
            let id = state.next_id;
            state.next_id += 1;
            let mut items: Vec<Item> = request
                .items
                .into_iter()
                .map(|i| Item {
                    kind: i.kind,
                    id: i.id,
                    label: i.label,
                    status: ItemStatus::Pending,
                    message: String::new(),
                    bytes: 0,
                    transferred: false,
                })
                .collect();
            // Dependencies first: a container needs its image and volumes on the destination.
            items.sort_by_key(|i| match i.kind {
                Kind::Image => 0,
                Kind::Volume => 1,
                Kind::Container => 2,
            });
            let job = Job {
                id,
                from: request.from,
                to: request.to,
                from_label: request.from_label,
                to_label: request.to_label,
                mode: request.mode,
                status: JobStatus::Queued,
                message: String::new(),
                items,
                created_at: now(),
                finished_at: None,
            };
            state.jobs.push(job.clone());
            let excess = state.jobs.iter().filter(|j| finished(j.status)).count().saturating_sub(MAX_HISTORY);
            let mut dropped = 0;
            state.jobs.retain(|j| {
                if dropped < excess && finished(j.status) {
                    dropped += 1;
                    false
                } else {
                    true
                }
            });
            Self::persist(&state);
            job
        };
        let _ = app.emit("migration-update", job.clone());
        self.spawn_worker(app.clone());
        Ok(job)
    }

    /// Cancels a queued job right away, or a running one at the next chunk of data.
    pub fn cancel(&self, app: &AppHandle, id: u64) {
        let queued = {
            let mut state = self.0.state.lock().unwrap();
            let queued = state.jobs.iter().any(|j| j.id == id && j.status == JobStatus::Queued);
            if !queued {
                state.cancelled.push(id);
            }
            queued
        };
        if queued {
            self.update(app, id, true, |job| {
                job.status = JobStatus::Cancelled;
                job.finished_at = Some(now());
                for item in &mut job.items {
                    item.status = ItemStatus::Skipped;
                }
            });
        }
    }

    /// Forgets the finished jobs.
    pub fn clear_history(&self) {
        let mut state = self.0.state.lock().unwrap();
        state.jobs.retain(|j| !finished(j.status));
        Self::persist(&state);
    }

    fn spawn_worker(&self, app: AppHandle) {
        if self.0.worker.swap(true, Ordering::SeqCst) {
            return;
        }
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                let next = manager
                    .0
                    .state
                    .lock()
                    .unwrap()
                    .jobs
                    .iter()
                    .find(|j| j.status == JobStatus::Queued)
                    .map(|j| j.id);
                match next {
                    Some(id) => manager.run(&app, id).await,
                    None => {
                        manager.0.worker.store(false, Ordering::SeqCst);
                        // A job may have been queued between the check and the release.
                        let more = manager.0.state.lock().unwrap().jobs.iter().any(|j| j.status == JobStatus::Queued);
                        if more && !manager.0.worker.swap(true, Ordering::SeqCst) {
                            continue;
                        }
                        break;
                    }
                }
            }
        });
    }

    async fn run(&self, app: &AppHandle, id: u64) {
        let Some(job) = self.0.state.lock().unwrap().jobs.iter().find(|j| j.id == id).cloned() else {
            return;
        };
        self.update(app, id, true, |j| j.status = JobStatus::Running);

        let (src, dst) = match (engine::client_for_kind(&job.from), engine::client_for_kind(&job.to)) {
            (Ok(src), Ok(dst)) => (src, dst),
            (Err(e), _) | (_, Err(e)) => {
                self.finish(app, id, JobStatus::Failed, e);
                return;
            }
        };
        for (docker, label) in [(&src, &job.from_label), (&dst, &job.to_label)] {
            if docker.version().await.is_err() {
                self.finish(app, id, JobStatus::Failed, format!("{label} doesn't answer."));
                return;
            }
        }

        // Moving: quiet the containers first so their volumes are copied in a consistent state.
        if job.mode == Mode::Move {
            for item in job.items.iter().filter(|i| i.kind == Kind::Container) {
                transfer::stop_container(&src, &item.id).await;
            }
        }

        let cancelled: Cancelled = {
            let manager = self.clone();
            Arc::new(move || manager.is_cancelled(id))
        };

        for (index, item) in job.items.iter().enumerate() {
            if self.is_cancelled(id) {
                self.update(app, id, false, |j| j.items[index].status = ItemStatus::Skipped);
                continue;
            }
            self.update(app, id, false, |j| j.items[index].status = ItemStatus::Running);

            let progress: Progress = {
                let manager = self.clone();
                let app = app.clone();
                let last = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));
                Arc::new(move |bytes| {
                    let mut last = last.lock().unwrap();
                    if last.elapsed() >= Duration::from_millis(300) {
                        *last = Instant::now();
                        manager.update(&app, id, false, |j| j.items[index].bytes = bytes);
                    }
                })
            };

            let result = match item.kind {
                Kind::Image => transfer::copy_image(&src, &dst, &item.id, progress, cancelled.clone()).await,
                Kind::Volume => transfer::copy_volume(&src, &dst, &item.id, progress, cancelled.clone()).await,
                Kind::Container => transfer::copy_container(&src, &dst, &item.id).await,
            };
            self.update(app, id, true, |j| {
                let item = &mut j.items[index];
                match result {
                    Ok(Outcome::Copied(message)) => {
                        item.status = ItemStatus::Done;
                        item.transferred = true;
                        item.message = message;
                    }
                    Ok(Outcome::Existing(message)) => {
                        item.status = ItemStatus::Skipped;
                        item.message = message;
                    }
                    Err(message) => {
                        item.status = ItemStatus::Failed;
                        item.message = message;
                    }
                }
            });
        }

        if job.mode == Mode::Move && !self.is_cancelled(id) {
            self.remove_from_source(app, id, &src).await;
        }

        let done = self.0.state.lock().unwrap().jobs.iter().find(|j| j.id == id).cloned();
        let Some(done) = done else { return };
        let count = |status| done.items.iter().filter(|i| i.status == status).count();
        let (failed, done_n, skipped) = (count(ItemStatus::Failed), count(ItemStatus::Done), count(ItemStatus::Skipped));
        let status = if self.is_cancelled(id) {
            JobStatus::Cancelled
        } else if failed == 0 {
            JobStatus::Done
        } else if done_n + skipped > 0 {
            JobStatus::Partial
        } else {
            JobStatus::Failed
        };
        let message = match status {
            JobStatus::Cancelled => "Cancelled.".to_string(),
            JobStatus::Done => format!("{done_n} copied, {skipped} already there."),
            _ => format!("{failed} failed, {done_n} copied, {skipped} skipped."),
        };
        self.finish(app, id, status, message);
    }

    /// Move mode: removes what was really copied, containers before the volumes and images they use.
    async fn remove_from_source(&self, app: &AppHandle, id: u64, src: &bollard::Docker) {
        let Some(job) = self.0.state.lock().unwrap().jobs.iter().find(|j| j.id == id).cloned() else {
            return;
        };
        let mut order: Vec<usize> = (0..job.items.len()).filter(|&i| job.items[i].transferred).collect();
        order.sort_by_key(|&i| match job.items[i].kind {
            Kind::Container => 0,
            Kind::Volume => 1,
            Kind::Image => 2,
        });
        for index in order {
            let item = &job.items[index];
            let result = match item.kind {
                Kind::Container => transfer::remove_container(src, &item.id).await,
                Kind::Volume => transfer::remove_volume(src, &item.id).await,
                Kind::Image => transfer::remove_image(src, &item.id).await,
            };
            self.update(app, id, true, |j| {
                let message = &mut j.items[index].message;
                match result {
                    Ok(()) => *message = format!("{message}; removed from the source"),
                    Err(e) => *message = format!("{message}; kept on the source ({e})"),
                }
            });
        }
    }

    fn finish(&self, app: &AppHandle, id: u64, status: JobStatus, message: String) {
        self.update(app, id, true, |j| {
            j.status = status;
            j.message = message;
            j.finished_at = Some(now());
            for item in j.items.iter_mut().filter(|i| matches!(i.status, ItemStatus::Pending | ItemStatus::Running)) {
                item.status = ItemStatus::Skipped;
            }
        });
        self.0.state.lock().unwrap().cancelled.retain(|c| *c != id);
    }
}

fn finished(status: JobStatus) -> bool {
    !matches!(status, JobStatus::Queued | JobStatus::Running)
}
