pub mod containers;
pub mod images;
pub mod volumes;
pub mod compose;
pub mod engine;
pub mod logs;
pub mod stats;

use bollard::Docker;

pub fn connect() -> Result<Docker, String> {
    engine::connect()
}
