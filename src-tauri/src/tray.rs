//! Notification-area icon: keeps Portus reachable while its window is closed and shows, in its
//! tooltip, what is still running in the background.

use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::docker;
use crate::migration::MigrationManager;

const TRAY_ID: &str = "portus";

pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Portus", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Portus", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Portus")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            refresh_tooltip(&handle).await;
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
    Ok(())
}

/// "Portus - 3 containers running - 1 migration in progress".
async fn refresh_tooltip(app: &AppHandle) {
    let mut parts = vec!["Portus".to_string()];
    if docker::engine::detect().await {
        if let Ok(client) = docker::connect() {
            let running = client
                .list_containers(Some(bollard::container::ListContainersOptions::<String> {
                    all: false,
                    ..Default::default()
                }))
                .await
                .map(|c| c.len())
                .ok();
            if let Some(n) = running {
                parts.push(format!("{n} container{} running", if n == 1 { "" } else { "s" }));
            }
        }
    } else {
        parts.push("Docker not reachable".into());
    }
    let jobs = app.state::<MigrationManager>().active_count();
    if jobs > 0 {
        parts.push(format!("{jobs} migration{} in progress", if jobs == 1 { "" } else { "s" }));
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(parts.join(" - ")));
    }
}
