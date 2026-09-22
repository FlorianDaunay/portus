#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod docker;
mod settings;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage(docker::engine::EngineManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_engine_status,
            commands::start_engine,
            commands::takeover_engine,
            commands::stop_engine,
            commands::install_engine,
            commands::get_settings,
            commands::set_stop_engine_on_exit,
            commands::get_daemon_info,
            commands::list_containers,
            commands::start_container,
            commands::stop_container,
            commands::restart_container,
            commands::remove_container,
            commands::list_images,
            commands::remove_image,
            commands::list_volumes,
            commands::remove_volume,
            commands::list_compose_projects,
            commands::list_recent_logs,
            commands::stream_container_logs,
        ])
        .build(tauri::generate_context!())
        .expect("error while building portus")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<docker::engine::EngineManager>().shutdown();
            }
        });
}
