#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod console;
mod docker;
mod migration;
mod settings;
mod tray;

use tauri::Manager;

/// Flag given to the app when the OS starts it at login.
const AUTOSTART_FLAG: &str = "--autostart";

fn main() {
    tauri::Builder::default()
        // A second launch (double-click on the exe while Portus sits in the tray) reopens the window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_window(app)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .manage(docker::engine::EngineManager::default())
        .manage(migration::MigrationManager::load())
        .manage(console::ConsoleManager::default())
        .setup(|app| {
            tray::setup(app.handle())?;
            let at_login = std::env::args().any(|a| a == AUTOSTART_FLAG);
            let hidden = at_login && settings::load().start_minimized;
            if !hidden {
                tray::show_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if settings::load().keep_running_in_background {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_engine_status,
            commands::start_engine,
            commands::takeover_engine,
            commands::stop_engine,
            commands::install_engine,
            commands::get_settings,
            commands::set_stop_engine_on_exit,
            commands::set_keep_running_in_background,
            commands::set_start_minimized,
            commands::set_launch_at_startup,
            commands::set_engine_source,
            commands::list_engines,
            commands::get_engine_contents,
            commands::list_migrations,
            commands::start_migration,
            commands::cancel_migration,
            commands::clear_migration_history,
            commands::run_console_command,
            commands::cancel_console_command,
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
