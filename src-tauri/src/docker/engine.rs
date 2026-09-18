use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use bollard::{Docker, API_DEFAULT_VERSION};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::settings;

const TLS_ADDR: &str = "tcp://127.0.0.1:2376";
const START_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_LOG_LINES: usize = 60;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const WRAPPER_PATH: &str = "/usr/local/bin/portus-dockerd";
const LOG_PATH: &str = "/var/log/portus-dockerd.log";
const TLS_DIR_WSL: &str = "/etc/portus/tls";

/// Idempotent, run as root in the distro: creates a private CA plus server and client certificates
/// (only when missing or close to expiry) and the wrapper that starts dockerd with mutual TLS.
const PREPARE_SCRIPT: &str = r##"set -e
umask 077
D=/etc/portus/tls
mkdir -p "$D"
chmod 700 /etc/portus "$D"
need=0
for f in ca.pem ca-key.pem server-cert.pem server-key.pem client-cert.pem client-key.pem; do
  [ -s "$D/$f" ] || need=1
done
if [ "$need" = 0 ]; then
  for f in server-cert.pem client-cert.pem; do
    openssl x509 -checkend 2592000 -noout -in "$D/$f" >/dev/null 2>&1 </dev/null || need=1
  done
fi
if [ "$need" = 1 ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update </dev/null
    DEBIAN_FRONTEND=noninteractive apt-get install -y openssl </dev/null
  fi
  cd "$D"
  rm -f ./*.pem ./*.csr ./*.srl ./*.cnf
  openssl genrsa -out ca-key.pem 4096 </dev/null
  openssl req -new -x509 -days 3650 -sha256 -key ca-key.pem -subj "/CN=Portus local CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out ca.pem </dev/null
  openssl genrsa -out server-key.pem 2048 </dev/null
  openssl req -new -key server-key.pem -subj "/CN=127.0.0.1" -out server.csr </dev/null
  printf 'subjectAltName=IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n' > server-ext.cnf
  openssl x509 -req -days 3650 -sha256 -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
    -out server-cert.pem -extfile server-ext.cnf </dev/null
  openssl genrsa -out client-key.pem 2048 </dev/null
  openssl req -new -key client-key.pem -subj "/CN=portus-client" -out client.csr </dev/null
  printf 'extendedKeyUsage=clientAuth\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\n' > client-ext.cnf
  openssl x509 -req -days 3650 -sha256 -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
    -out client-cert.pem -extfile client-ext.cnf </dev/null
  rm -f ./*.csr ./*.cnf ./*.srl
  chmod 600 ./*-key.pem
fi
cat > /usr/local/bin/portus-dockerd <<'EOF'
#!/bin/sh
exec dockerd -H tcp://127.0.0.1:2376 -H unix:///var/run/docker.sock \
  --tlsverify --tlscacert=/etc/portus/tls/ca.pem \
  --tlscert=/etc/portus/tls/server-cert.pem --tlskey=/etc/portus/tls/server-key.pem \
  >/var/log/portus-dockerd.log 2>&1
EOF
chmod 755 /usr/local/bin/portus-dockerd
pgrep -x dockerd >/dev/null 2>&1 || : > /var/log/portus-dockerd.log
"##;

const INSTALL_SCRIPT: &str = r##"set -e
export DEBIAN_FRONTEND=noninteractive
. /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *) echo "Automatic install only supports Ubuntu and Debian (found: $ID)." >&2; exit 2 ;;
esac
echo "==> Installing Docker Engine (docker-ce) from Docker's official apt repository"
apt-get update
apt-get install -y ca-certificates curl gnupg openssl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io
if [ -d /run/systemd/system ]; then
  systemctl disable --now docker.service docker.socket >/dev/null 2>&1 || true
fi
service docker stop >/dev/null 2>&1 || true
pkill -x dockerd >/dev/null 2>&1 || true
which dockerd
echo "==> Docker Engine installed"
"##;

const STOP_SCRIPT: &str = "pkill -TERM -x dockerd\ni=0\nwhile pgrep -x dockerd >/dev/null && [ $i -lt 60 ]; do sleep 0.3; i=$((i+1)); done\n";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Endpoint {
    Local,
    Tls,
}

static ENDPOINT: Mutex<Endpoint> = Mutex::new(Endpoint::Local);

fn tls_dir() -> PathBuf {
    settings::data_dir().join("tls")
}

fn client(endpoint: Endpoint) -> Result<Docker, String> {
    match endpoint {
        Endpoint::Local => Docker::connect_with_local_defaults(),
        Endpoint::Tls => {
            let dir = tls_dir();
            Docker::connect_with_ssl(
                TLS_ADDR,
                &dir.join("key.pem"),
                &dir.join("cert.pem"),
                &dir.join("ca.pem"),
                120,
                API_DEFAULT_VERSION,
            )
        }
    }
    .map_err(|e| e.to_string())
}

/// Client for whichever endpoint `detect()` last found responding.
pub fn connect() -> Result<Docker, String> {
    client(*ENDPOINT.lock().unwrap())
}

/// True when the reachable engine is the WSL engine that Portus manages itself.
pub fn is_managed() -> bool {
    *ENDPOINT.lock().unwrap() == Endpoint::Tls
}

async fn responds(endpoint: Endpoint) -> bool {
    let Ok(docker) = client(endpoint) else {
        return false;
    };
    matches!(
        tokio::time::timeout(Duration::from_secs(3), docker.version()).await,
        Ok(Ok(_))
    )
}

/// Looks for a reachable engine (local socket/pipe first, then the WSL engine over mutual TLS).
pub async fn detect() -> bool {
    for endpoint in [Endpoint::Local, Endpoint::Tls] {
        if responds(endpoint).await {
            *ENDPOINT.lock().unwrap() = endpoint;
            return true;
        }
    }
    false
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EngineState {
    Ready,
    Stopped,
    NotInstalled,
    WslUnavailable,
    Unsupported,
    Error,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub state: EngineState,
    pub distro: Option<String>,
    pub message: String,
    pub logs: Vec<String>,
}

#[derive(Default)]
pub struct EngineManager {
    op: tokio::sync::Mutex<()>,
    logs: Arc<Mutex<VecDeque<String>>>,
}

impl EngineManager {
    fn status(&self, state: EngineState, distro: Option<String>, message: impl Into<String>) -> EngineStatus {
        // Only errors carry a log: otherwise it would be a stale leftover of an earlier run.
        let logs = if state == EngineState::Error {
            self.logs.lock().unwrap().iter().cloned().collect()
        } else {
            Vec::new()
        };
        EngineStatus {
            state,
            distro,
            message: message.into(),
            logs,
        }
    }

    fn set_logs(&self, lines: Vec<String>) {
        let skip = lines.len().saturating_sub(MAX_LOG_LINES);
        let mut logs = self.logs.lock().unwrap();
        logs.clear();
        logs.extend(lines.into_iter().skip(skip));
    }

    /// Called when Portus exits: only stops the engine when the user asked for it in the settings.
    pub fn shutdown(&self) {
        if !is_managed() {
            return;
        }
        let saved = settings::load();
        if let (true, Some(distro)) = (saved.stop_engine_on_exit, saved.engine_distro) {
            graceful_stop(&distro);
        }
    }
}

fn wsl() -> Command {
    let mut cmd = Command::new("wsl.exe");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.stdin(Stdio::null());
    cmd
}

fn graceful_stop(distro: &str) {
    use std::io::Write;
    let mut cmd = std::process::Command::new("wsl.exe");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.args(["-d", distro, "-u", "root", "--", "sh", "-s"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let Ok(mut child) = cmd.spawn() else {
        return;
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(STOP_SCRIPT.as_bytes());
    }
    let deadline = Instant::now() + Duration::from_secs(25);
    loop {
        match child.try_wait() {
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(200)),
            Ok(None) => {
                let _ = child.kill();
                break;
            }
            _ => break,
        }
    }
}

/// `wsl.exe` prints its own messages as UTF-16LE, while processes inside the distro print UTF-8.
fn decode(bytes: &[u8]) -> String {
    let utf16 = bytes.len() >= 2 && (bytes[..2] == [0xFF, 0xFE] || bytes[1] == 0);
    if utf16 {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units).trim_start_matches('\u{feff}').to_string()
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

async fn list_distros() -> Result<Vec<String>, String> {
    let out = wsl()
        .args(["-l", "-q"])
        .output()
        .await
        .map_err(|e| format!("wsl.exe could not be started: {e}"))?;
    if !out.status.success() {
        let text = decode(&out.stdout) + &decode(&out.stderr);
        return Err(text.trim().to_string());
    }
    Ok(decode(&out.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && !l.starts_with("docker-desktop"))
        .collect())
}

enum Probe {
    Found,
    Missing,
    Failed(String),
}

async fn probe_dockerd(distro: &str) -> Probe {
    match wsl()
        .args(["-d", distro, "-u", "root", "--", "which", "dockerd"])
        .output()
        .await
    {
        Err(e) => Probe::Failed(e.to_string()),
        Ok(out) => match out.status.code() {
            Some(0) => Probe::Found,
            Some(1) => Probe::Missing,
            _ => Probe::Failed(format!("{}{}", decode(&out.stdout), decode(&out.stderr)).trim().to_string()),
        },
    }
}

async fn dockerd_running(distro: &str) -> bool {
    matches!(
        wsl()
            .args(["-d", distro, "-u", "root", "--", "pgrep", "-x", "dockerd"])
            .output()
            .await,
        Ok(out) if out.status.success()
    )
}

async fn run_script(distro: &str, script: &str) -> Result<std::process::Output, String> {
    let mut child = wsl()
        .args(["-d", distro, "-u", "root", "--", "sh", "-s"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start wsl.exe: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(script.as_bytes())
            .await
            .map_err(|e| format!("Could not send the setup script to WSL: {e}"))?;
    }
    child
        .wait_with_output()
        .await
        .map_err(|e| format!("The setup script could not run: {e}"))
}

/// Copies the client certificate material from the distro into the user's private data folder.
async fn sync_client_certs(distro: &str) -> Result<(), String> {
    let dir = tls_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    for (remote, local) in [("ca.pem", "ca.pem"), ("client-cert.pem", "cert.pem"), ("client-key.pem", "key.pem")] {
        let out = wsl()
            .args(["-d", distro, "-u", "root", "--", "cat", &format!("{TLS_DIR_WSL}/{remote}")])
            .output()
            .await
            .map_err(|e| format!("Could not read {remote} from WSL: {e}"))?;
        if !out.status.success() || !out.stdout.starts_with(b"-----BEGIN") {
            return Err(format!("Could not read {remote} from WSL ({})", decode(&out.stderr).trim()));
        }
        tokio::fs::write(dir.join(local), &out.stdout)
            .await
            .map_err(|e| format!("Could not write {}: {e}", dir.join(local).display()))?;
    }
    Ok(())
}

/// Creates the TLS material and the dockerd wrapper in the distro, then syncs the client certificates.
async fn prepare(distro: &str) -> Result<(), String> {
    let out = run_script(distro, PREPARE_SCRIPT).await?;
    if !out.status.success() {
        return Err(format!(
            "Preparing the secure Docker endpoint failed: {}",
            format!("{}{}", decode(&out.stdout), decode(&out.stderr)).trim()
        ));
    }
    sync_client_certs(distro).await
}

async fn log_tail(distro: &str) -> Vec<String> {
    match wsl()
        .args(["-d", distro, "-u", "root", "--", "tail", "-n", "40", LOG_PATH])
        .output()
        .await
    {
        Ok(out) => decode(&out.stdout).lines().map(|l| l.to_string()).collect(),
        Err(_) => Vec::new(),
    }
}

fn pump<R>(reader: R, app: AppHandle, logs: Arc<Mutex<VecDeque<String>>>) -> tauri::async_runtime::JoinHandle<()>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                    if line.is_empty() {
                        continue;
                    }
                    {
                        let mut l = logs.lock().unwrap();
                        if l.len() >= MAX_LOG_LINES {
                            l.pop_front();
                        }
                        l.push_back(line.clone());
                    }
                    let _ = app.emit("engine-log", line);
                }
            }
        }
    })
}

/// Reports whether an engine is reachable and, if not, what Portus can do about it.
pub async fn status(mgr: &EngineManager) -> EngineStatus {
    if detect().await {
        let distro = settings::load().engine_distro;
        return mgr.status(EngineState::Ready, distro, "Docker Engine is running.");
    }

    if !cfg!(windows) {
        return mgr.status(
            EngineState::Unsupported,
            None,
            "Docker isn't running. Start the Docker daemon (for example `sudo systemctl start docker`) and retry.",
        );
    }

    let distros = match list_distros().await {
        Ok(d) => d,
        Err(e) => {
            return mgr.status(
                EngineState::WslUnavailable,
                None,
                format!("WSL2 is not available ({e}). Install it from an administrator terminal with `wsl --install`, reboot, then retry."),
            )
        }
    };
    if distros.is_empty() {
        return mgr.status(
            EngineState::WslUnavailable,
            None,
            "No WSL distribution is installed. Run `wsl --install -d Ubuntu` from an administrator terminal, then retry.",
        );
    }

    let mut missing: Option<String> = None;
    let mut failure: Option<String> = None;
    for distro in &distros {
        match probe_dockerd(distro).await {
            Probe::Found => {
                return mgr.status(
                    EngineState::Stopped,
                    Some(distro.clone()),
                    format!("Docker Engine is installed in WSL ({distro}) but isn't running."),
                )
            }
            Probe::Missing => {
                missing.get_or_insert_with(|| distro.clone());
            }
            Probe::Failed(e) => {
                failure.get_or_insert(e);
            }
        }
    }

    match (missing, failure) {
        (Some(distro), _) => mgr.status(
            EngineState::NotInstalled,
            Some(distro.clone()),
            format!("Docker Engine isn't installed in your WSL distribution \"{distro}\"."),
        ),
        (None, failure) => mgr.status(
            EngineState::Error,
            None,
            format!(
                "Could not query your WSL distributions: {}",
                failure.filter(|f| !f.is_empty()).unwrap_or_else(|| "unknown error".into())
            ),
        ),
    }
}

/// Runs the dockerd wrapper in its own hidden wsl.exe session. It is launched through
/// `cmd /c start` so that it is not a descendant of Portus: the engine keeps running (with its
/// containers) when Portus closes, crashes, or is killed together with its process tree.
fn spawn_engine_session(distro: &str) -> Result<(), String> {
    if !distro
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ' '))
    {
        return Err(format!("Unsupported WSL distribution name: \"{distro}\"."));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd;
        if distro.contains(' ') {
            // `start` mangles quoted arguments, so names with spaces are launched directly
            // (the engine then dies if Portus is killed together with its process tree).
            cmd = std::process::Command::new("wsl.exe");
            cmd.args(["-d", distro, "-u", "root", "--", WRAPPER_PATH]);
        } else {
            cmd = std::process::Command::new("cmd.exe");
            cmd.raw_arg(format!("/D /C start \"\" /B wsl.exe -d {distro} -u root -- {WRAPPER_PATH}"));
        }
        cmd.creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd.spawn()
            .map(|_| ())
            .map_err(|e| format!("Could not start wsl.exe: {e}"))
    }
    #[cfg(not(windows))]
    {
        Err("Starting the engine through WSL is only supported on Windows.".to_string())
    }
}

async fn start_locked(app: &AppHandle, mgr: &EngineManager) -> EngineStatus {
    let current = status(mgr).await;
    if current.state != EngineState::Stopped {
        return current;
    }
    let distro = current.distro.clone().unwrap_or_default();
    mgr.logs.lock().unwrap().clear();

    if let Err(e) = prepare(&distro).await {
        return mgr.status(EngineState::Error, Some(distro), e);
    }
    let _ = settings::update(|s| s.engine_distro = Some(distro.clone()));

    // The engine may already be running and only lacked the client certificates on this side.
    if detect().await {
        return mgr.status(
            EngineState::Ready,
            Some(distro.clone()),
            format!("Connected to the Docker Engine running in WSL ({distro})."),
        );
    }

    if dockerd_running(&distro).await {
        return mgr.status(
            EngineState::Error,
            Some(distro.clone()),
            format!(
                "A dockerd process is already running in \"{distro}\" but doesn't accept Portus's secure connection \
                 (it was probably started without Portus's certificates). Stop it with \
                 `wsl -d {distro} -u root pkill dockerd` or run `wsl --shutdown`, then retry."
            ),
        );
    }

    // Follow the engine log while it boots so the user sees progress.
    let tail = wsl()
        .args(["-d", &distro, "-u", "root", "--", "tail", "-n", "0", "-F", LOG_PATH])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn();
    let mut tail = tail.ok();
    if let Some(out) = tail.as_mut().and_then(|t| t.stdout.take()) {
        pump(out, app.clone(), mgr.logs.clone());
    }

    // dockerd runs inside its own wsl.exe session: it outlives Portus, and that session also keeps
    // the WSL distribution (and so the containers) alive after Portus closes.
    if let Err(e) = spawn_engine_session(&distro) {
        return mgr.status(EngineState::Error, Some(distro), e);
    }

    let began = Instant::now();
    let mut tick = 0u32;
    while began.elapsed() < START_TIMEOUT {
        tokio::time::sleep(Duration::from_millis(500)).await;
        tick += 1;
        if detect().await {
            return mgr.status(
                EngineState::Ready,
                Some(distro.clone()),
                format!("Docker Engine started in WSL ({distro})."),
            );
        }
        if began.elapsed() > Duration::from_secs(4) && tick % 4 == 0 && !dockerd_running(&distro).await {
            let lines = log_tail(&distro).await;
            let message = if lines.is_empty() {
                "dockerd could not be launched in WSL (it produced no output)."
            } else {
                "dockerd exited right after starting. See the log below."
            };
            mgr.set_logs(lines);
            return mgr.status(EngineState::Error, Some(distro), message);
        }
    }

    mgr.set_logs(log_tail(&distro).await);
    mgr.status(
        EngineState::Error,
        Some(distro),
        "Docker Engine did not become ready within 60 seconds. See the log below.",
    )
}

pub async fn start(app: &AppHandle, mgr: &EngineManager) -> EngineStatus {
    let _guard = mgr.op.lock().await;
    start_locked(app, mgr).await
}

/// Stops the WSL engine (and its containers) on request.
pub async fn stop(mgr: &EngineManager) -> EngineStatus {
    let _guard = mgr.op.lock().await;
    let Some(distro) = settings::load().engine_distro else {
        return status(mgr).await;
    };
    let _ = tokio::task::spawn_blocking(move || graceful_stop(&distro)).await;
    status(mgr).await
}

pub async fn install(app: &AppHandle, mgr: &EngineManager) -> EngineStatus {
    let _guard = mgr.op.lock().await;
    let current = status(mgr).await;
    if current.state != EngineState::NotInstalled {
        return current;
    }
    let distro = current.distro.clone().unwrap_or_default();

    mgr.logs.lock().unwrap().clear();
    let spawned = wsl()
        .args(["-d", &distro, "-u", "root", "--", "sh", "-s"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match spawned {
        Ok(c) => c,
        Err(e) => {
            return mgr.status(EngineState::Error, Some(distro), format!("Could not start wsl.exe: {e}"));
        }
    };

    let readers = [
        child.stdout.take().map(|s| pump(s, app.clone(), mgr.logs.clone())),
        child.stderr.take().map(|s| pump(s, app.clone(), mgr.logs.clone())),
    ];
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(INSTALL_SCRIPT.as_bytes()).await;
    }
    let result = child.wait().await;
    for reader in readers.into_iter().flatten() {
        let _ = reader.await;
    }

    match result {
        Ok(status) if status.success() => start_locked(app, mgr).await,
        Ok(status) => mgr.status(
            EngineState::Error,
            Some(distro),
            format!("The installation failed (exit code {}). See the log below.", status.code().unwrap_or(-1)),
        ),
        Err(e) => mgr.status(EngineState::Error, Some(distro), format!("The installation could not run: {e}")),
    }
}
