//! Saved registries (Docker Hub, GitHub / GitLab container registries, self-hosted ones) and the
//! HTTP side of browsing them (search, tags). Pulling and pushing go through the engine, see `docker/registry.rs`.
//!
//! Credentials are kept in `registries.json` next to the settings, in clear text (like a Docker `config.json`
//! without a credential helper); the frontend only ever learns whether a password is set.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use reqwest::header::WWW_AUTHENTICATE;
use reqwest::{Client, Response, StatusCode};
use serde::{Deserialize, Serialize};

use crate::settings::data_dir;

pub const HUB_ID: &str = "hub";
const HUB_API: &str = "https://registry-1.docker.io";

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Hub,
    Ghcr,
    Gitlab,
    Custom,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    /// Registry address (`ghcr.io`, `registry.gitlab.com`, `localhost:5000`), scheme optional.
    pub host: String,
    pub username: String,
    #[serde(default)]
    pub password: String,
}

/// What the frontend sees: never the password.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistryInfo {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub host: String,
    pub username: String,
    pub has_password: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryInput {
    pub id: Option<String>,
    pub name: String,
    pub kind: Kind,
    pub host: String,
    pub username: String,
    /// `None` keeps the saved password.
    pub password: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoHit {
    pub name: String,
    pub description: String,
    pub stars: Option<i64>,
    pub official: bool,
}

impl Registry {
    /// Host used in image references (`docker.io` is left out of them).
    pub fn host(&self) -> String {
        match self.kind {
            Kind::Hub => "docker.io".into(),
            Kind::Ghcr => "ghcr.io".into(),
            _ => bare_host(&self.host),
        }
    }

    fn base_url(&self) -> String {
        match self.kind {
            Kind::Hub => HUB_API.into(),
            Kind::Ghcr => "https://ghcr.io".into(),
            _ => {
                let h = self.host.trim().trim_end_matches('/');
                if h.starts_with("http://") || h.starts_with("https://") {
                    h.into()
                } else if h.starts_with("localhost") || h.starts_with("127.") {
                    format!("http://{h}")
                } else {
                    format!("https://{h}")
                }
            }
        }
    }

    /// Full image name (without tag) for a repository of this registry.
    pub fn image_name(&self, repository: &str) -> String {
        let repo = repository.trim().trim_matches('/');
        if self.kind == Kind::Hub {
            repo.strip_prefix("library/").unwrap_or(repo).to_string()
        } else {
            format!("{}/{repo}", self.host())
        }
    }

    fn info(&self) -> RegistryInfo {
        RegistryInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            kind: self.kind,
            host: self.host(),
            username: self.username.clone(),
            has_password: !self.password.is_empty(),
        }
    }
}

fn bare_host(host: &str) -> String {
    host.trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/')
        .to_string()
}

fn path() -> PathBuf {
    data_dir().join("registries.json")
}

fn hub() -> Registry {
    Registry {
        id: HUB_ID.into(),
        name: "Docker Hub".into(),
        kind: Kind::Hub,
        host: "docker.io".into(),
        username: String::new(),
        password: String::new(),
    }
}

/// Saved registries, Docker Hub always first.
pub fn load() -> Vec<Registry> {
    let mut list: Vec<Registry> = std::fs::read_to_string(path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    if !list.iter().any(|r| r.id == HUB_ID) {
        list.insert(0, hub());
    }
    list
}

fn save(list: &[Registry]) -> Result<(), String> {
    std::fs::create_dir_all(data_dir()).map_err(|e| format!("Could not create the data folder: {e}"))?;
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    let file = path();
    std::fs::write(&file, text).map_err(|e| format!("Could not save registries: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn get(id: &str) -> Result<Registry, String> {
    load().into_iter().find(|r| r.id == id).ok_or_else(|| "Unknown registry.".to_string())
}

pub fn infos() -> Vec<RegistryInfo> {
    load().iter().map(Registry::info).collect()
}

pub fn upsert(input: RegistryInput) -> Result<Vec<RegistryInfo>, String> {
    let mut list = load();
    let host = match input.kind {
        Kind::Hub => "docker.io".to_string(),
        Kind::Ghcr => "ghcr.io".to_string(),
        Kind::Gitlab if input.host.trim().is_empty() => "registry.gitlab.com".to_string(),
        _ => input.host.trim().to_string(),
    };
    if host.is_empty() {
        return Err("Enter the registry address.".into());
    }
    let name = if input.name.trim().is_empty() { bare_host(&host) } else { input.name.trim().to_string() };
    let existing = input.id.as_deref().and_then(|id| list.iter().position(|r| r.id == id));
    match existing {
        Some(i) => {
            let r = &mut list[i];
            if r.id != HUB_ID {
                r.name = name;
                r.kind = input.kind;
                r.host = host;
            }
            r.username = input.username.trim().to_string();
            if let Some(p) = input.password {
                r.password = p;
            }
        }
        None => {
            let id = format!(
                "r{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0)
            );
            list.push(Registry {
                id,
                name,
                kind: input.kind,
                host,
                username: input.username.trim().to_string(),
                password: input.password.unwrap_or_default(),
            });
        }
    }
    save(&list)?;
    Ok(list.iter().map(Registry::info).collect())
}

pub fn remove(id: &str) -> Result<Vec<RegistryInfo>, String> {
    if id == HUB_ID {
        return Err("Docker Hub cannot be removed (clear its credentials instead).".into());
    }
    let mut list = load();
    list.retain(|r| r.id != id);
    save(&list)?;
    Ok(list.iter().map(Registry::info).collect())
}

// ---- HTTP (Registry API v2) ----

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Portus")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

fn net_err(e: reqwest::Error) -> String {
    format!("Could not reach the registry: {e}")
}

/// Parses `Bearer realm="...",service="...",scope="..."`.
fn parse_challenge(header: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let rest = header.split_once(' ').map(|(_, r)| r).unwrap_or("");
    let mut chars = rest.chars().peekable();
    loop {
        let mut key = String::new();
        while let Some(&c) = chars.peek() {
            if c == '=' {
                break;
            }
            chars.next();
            if c != ',' && !c.is_whitespace() {
                key.push(c);
            }
        }
        if chars.next().is_none() {
            break;
        }
        let mut value = String::new();
        if chars.peek() == Some(&'"') {
            chars.next();
            for c in chars.by_ref() {
                if c == '"' {
                    break;
                }
                value.push(c);
            }
        } else {
            while let Some(&c) = chars.peek() {
                if c == ',' {
                    break;
                }
                value.push(c);
                chars.next();
            }
        }
        out.insert(key.to_ascii_lowercase(), value);
    }
    out
}

/// GET on the registry, answering its authentication challenge (token or basic) when there is one.
async fn v2_get(reg: &Registry, path: &str) -> Result<Response, String> {
    let http = client()?;
    let url = format!("{}{path}", reg.base_url());
    let first = http.get(&url).send().await.map_err(net_err)?;
    if first.status() != StatusCode::UNAUTHORIZED {
        return Ok(first);
    }
    let challenge = first
        .headers()
        .get(WWW_AUTHENTICATE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let has_credentials = !reg.username.is_empty();
    let mut retry = http.get(&url);
    if challenge.to_ascii_lowercase().starts_with("bearer") {
        let params = parse_challenge(&challenge);
        let realm = params.get("realm").ok_or("The registry sent an invalid authentication challenge.")?;
        let mut token_req = http.get(realm);
        if let Some(service) = params.get("service") {
            token_req = token_req.query(&[("service", service)]);
        }
        if let Some(scope) = params.get("scope") {
            token_req = token_req.query(&[("scope", scope)]);
        }
        if has_credentials {
            token_req = token_req.basic_auth(&reg.username, Some(&reg.password));
        }
        let response = token_req.send().await.map_err(net_err)?;
        if !response.status().is_success() {
            return Err(if has_credentials {
                "Authentication failed: check the username and password (token) of this registry.".into()
            } else {
                "This registry requires credentials: add them in the registry settings.".into()
            });
        }
        let body: serde_json::Value = response.json().await.map_err(net_err)?;
        let token = body
            .get("token")
            .or_else(|| body.get("access_token"))
            .and_then(|t| t.as_str())
            .ok_or("The registry did not return a token.")?;
        retry = retry.bearer_auth(token);
    } else if has_credentials {
        retry = retry.basic_auth(&reg.username, Some(&reg.password));
    }
    retry.send().await.map_err(net_err)
}

async fn ok_json(response: Response) -> Result<serde_json::Value, String> {
    let status = response.status();
    match status {
        s if s.is_success() => response.json().await.map_err(net_err),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            Err("Access denied: this needs credentials with read access (see the registry settings).".into())
        }
        StatusCode::NOT_FOUND => Err("Not found on this registry.".into()),
        s => Err(format!("The registry answered {s}.")),
    }
}

/// Checks that the registry answers and accepts the saved credentials.
pub async fn test(reg: &Registry) -> Result<(), String> {
    let response = v2_get(reg, "/v2/").await?;
    match response.status() {
        s if s.is_success() => Ok(()),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err("The registry rejected the credentials.".into()),
        s => Err(format!("The registry answered {s}.")),
    }
}

pub async fn search(reg: &Registry, query: &str) -> Result<Vec<RepoHit>, String> {
    let query = query.trim();
    if reg.kind == Kind::Hub {
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let response = client()?
            .get("https://hub.docker.com/v2/search/repositories/")
            .query(&[("query", query), ("page_size", "30")])
            .send()
            .await
            .map_err(net_err)?;
        let body = ok_json(response).await?;
        return Ok(body["results"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .map(|i| RepoHit {
                        name: i["repo_name"].as_str().unwrap_or_default().to_string(),
                        description: i["short_description"].as_str().unwrap_or_default().to_string(),
                        stars: i["star_count"].as_i64(),
                        official: i["is_official"].as_bool().unwrap_or(false),
                    })
                    .collect()
            })
            .unwrap_or_default());
    }

    let response = v2_get(reg, "/v2/_catalog?n=1000").await?;
    if matches!(response.status(), StatusCode::NOT_FOUND | StatusCode::METHOD_NOT_ALLOWED) {
        return Err(
            "This registry does not list its repositories. Type a full repository path (for example owner/image) and open it."
                .into(),
        );
    }
    let body = ok_json(response).await?;
    let needle = query.to_lowercase();
    Ok(body["repositories"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|r| r.as_str())
                .filter(|r| needle.is_empty() || r.to_lowercase().contains(&needle))
                .map(|r| RepoHit { name: r.to_string(), description: String::new(), stars: None, official: false })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn tags(reg: &Registry, repository: &str) -> Result<Vec<String>, String> {
    let mut repo = repository.trim().trim_matches('/').to_string();
    if repo.is_empty() {
        return Err("Enter a repository.".into());
    }
    if reg.kind == Kind::Hub && !repo.contains('/') {
        repo = format!("library/{repo}");
    }
    let response = v2_get(reg, &format!("/v2/{repo}/tags/list?n=500")).await?;
    let body = ok_json(response).await?;
    Ok(body["tags"]
        .as_array()
        .map(|t| t.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default())
}
