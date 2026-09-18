pub mod containers;
pub mod images;
pub mod volumes;
pub mod compose;
pub mod logs;

use bollard::Docker;

pub fn connect() -> Result<Docker, String> {
    Docker::connect_with_local_defaults().map_err(|e| e.to_string())
}
