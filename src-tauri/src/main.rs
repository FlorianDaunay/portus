#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod docker;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
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
        .run(tauri::generate_context!())
        .expect("error while running portus");
}
