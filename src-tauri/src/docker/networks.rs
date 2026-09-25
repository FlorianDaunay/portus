use bollard::container::ListContainersOptions;
use bollard::network::ListNetworksOptions;
use bollard::Docker;
use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkNode {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub internal: bool,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
    /// `bridge`, `host` and `none`: created by Docker itself.
    pub builtin: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub network: String,
    pub ip: Option<String>,
    pub aliases: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortMapping {
    /// Set when the port is published on the host.
    pub host_ip: Option<String>,
    pub host_port: Option<u16>,
    pub container_port: u16,
    pub protocol: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContainerNode {
    pub id: String,
    pub name: String,
    pub state: String,
    pub project: Option<String>,
    pub networks: Vec<Attachment>,
    pub ports: Vec<PortMapping>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkMap {
    pub networks: Vec<NetworkNode>,
    pub containers: Vec<ContainerNode>,
}

pub async fn map(docker: &Docker) -> Result<NetworkMap, String> {
    let networks = docker
        .list_networks(None::<ListNetworksOptions<String>>)
        .await
        .map_err(|e| e.to_string())?;
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    let mut nodes: Vec<NetworkNode> = networks
        .into_iter()
        .map(|n| {
            let name = n.name.unwrap_or_default();
            let ipam = n
                .ipam
                .and_then(|i| i.config)
                .and_then(|c| c.into_iter().find(|c| c.subnet.is_some()));
            NetworkNode {
                id: n.id.unwrap_or_default(),
                builtin: matches!(name.as_str(), "bridge" | "host" | "none"),
                name,
                driver: n.driver.unwrap_or_default(),
                scope: n.scope.unwrap_or_default(),
                internal: n.internal.unwrap_or(false),
                subnet: ipam.as_ref().and_then(|c| c.subnet.clone()),
                gateway: ipam.and_then(|c| c.gateway).filter(|g| !g.is_empty()),
            }
        })
        .collect();
    nodes.sort_by(|a, b| b.builtin.cmp(&a.builtin).then(a.name.cmp(&b.name)));

    let containers = containers
        .into_iter()
        .map(|c| {
            let name = c
                .names
                .and_then(|n| n.into_iter().next())
                .map(|n| n.trim_start_matches('/').to_string())
                .unwrap_or_default();
            let mut attachments: Vec<Attachment> = c
                .network_settings
                .and_then(|s| s.networks)
                .unwrap_or_default()
                .into_iter()
                .map(|(network, e)| Attachment {
                    network,
                    ip: e.ip_address.filter(|ip| !ip.is_empty()),
                    aliases: e.aliases.unwrap_or_default(),
                })
                .collect();
            attachments.sort_by(|a, b| a.network.cmp(&b.network));

            let mut ports: Vec<PortMapping> = c
                .ports
                .unwrap_or_default()
                .into_iter()
                .map(|p| PortMapping {
                    host_ip: p.public_port.and(p.ip),
                    host_port: p.public_port,
                    container_port: p.private_port,
                    protocol: p.typ.map(|t| t.to_string()).filter(|t| !t.is_empty()).unwrap_or_else(|| "tcp".into()),
                })
                .collect();
            ports.sort_by_key(|p| (p.host_port.unwrap_or(0), p.container_port));
            // Docker lists a published port once per address family (0.0.0.0 and ::).
            ports.dedup_by(|a, b| a.host_port == b.host_port && a.container_port == b.container_port && a.protocol == b.protocol);

            ContainerNode {
                id: c.id.unwrap_or_default(),
                name,
                state: c.state.unwrap_or_default(),
                project: c.labels.and_then(|l| l.get("com.docker.compose.project").cloned()),
                networks: attachments,
                ports,
            }
        })
        .collect();

    Ok(NetworkMap { networks: nodes, containers })
}
