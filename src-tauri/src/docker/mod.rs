pub mod containers;
pub mod images;
pub mod volumes;
pub mod compose;
pub mod engine;
pub mod logs;
pub mod networks;
pub mod registry;
pub mod stats;
pub mod transfer;

use bollard::Docker;

pub fn connect() -> Result<Docker, String> {
    engine::connect()
}
