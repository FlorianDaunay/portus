use bollard::container::StatsOptions;
use bollard::Docker;
use futures_util::StreamExt;

pub struct Usage {
    pub cpu_percent: f64,
    pub mem_usage_bytes: u64,
    pub mem_limit_bytes: u64,
}

/// Fetches a single stats sample for a running container and computes CPU/memory
/// usage the same way `docker stats` does. Waits for two cycles (stream: false,
/// one_shot: false) so the CPU delta is meaningful.
pub async fn usage(docker: &Docker, id: &str) -> Usage {
    let options = StatsOptions {
        stream: false,
        one_shot: false,
    };

    let mut stream = docker.stats(id, Some(options));
    let Some(Ok(stats)) = stream.next().await else {
        return Usage {
            cpu_percent: 0.0,
            mem_usage_bytes: 0,
            mem_limit_bytes: 0,
        };
    };

    let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as f64
        - stats.precpu_stats.cpu_usage.total_usage as f64;
    let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as f64
        - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as f64;
    let online_cpus = stats.cpu_stats.online_cpus.unwrap_or_else(|| {
        stats
            .cpu_stats
            .cpu_usage
            .percpu_usage
            .as_ref()
            .map(|v| v.len() as u64)
            .unwrap_or(1)
    }) as f64;

    let cpu_percent = if system_delta > 0.0 && cpu_delta > 0.0 {
        (cpu_delta / system_delta) * online_cpus * 100.0
    } else {
        0.0
    };

    let mem_usage_bytes = stats.memory_stats.usage.unwrap_or(0);
    let mem_limit_bytes = stats.memory_stats.limit.unwrap_or(0);

    Usage {
        cpu_percent,
        mem_usage_bytes,
        mem_limit_bytes,
    }
}
