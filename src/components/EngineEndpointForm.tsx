import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plug } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSettings, setEngineSource } from "@/lib/api";
import { refreshAfterEngineSwitch } from "@/lib/engineFlags";
import { isWindows } from "@/lib/utils";

const inputClass =
  "h-9 w-full rounded-control border border-border bg-surface px-3 font-mono text-xs text-text-primary shadow-inset placeholder:text-text-muted";

const examples = isWindows
  ? [
      { label: "Docker Desktop", value: "npipe:////./pipe/docker_engine" },
      { label: "Remote (TLS)", value: "tcp://192.168.1.10:2376" },
    ]
  : [
      { label: "Docker / Docker Desktop", value: "unix:///var/run/docker.sock" },
      { label: "Colima", value: "unix:///Users/you/.colima/default/docker.sock" },
      { label: "Remote (TLS)", value: "tcp://192.168.1.10:2376" },
    ];

/** Lets the user type the address of any Docker engine, with hints on where to find it. */
export function EngineEndpointForm({ onSaved }: { onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [endpoint, setEndpoint] = useState("");
  const [tlsDir, setTlsDir] = useState("");

  useEffect(() => {
    if (!settings) return;
    setEndpoint(settings.customEndpoint ?? "");
    setTlsDir(settings.customTlsDir ?? "");
  }, [settings]);

  const connect = useMutation({
    mutationFn: () => setEngineSource("custom", endpoint, tlsDir),
    onSuccess: () => {
      refreshAfterEngineSwitch(queryClient);
      onSaved?.();
    },
    meta: { label: "Connect to Docker" },
  });

  const wantsTls = /^(tcp|https):\/\//.test(endpoint.trim());
  const plainTcp = /^(tcp|http):\/\//.test(endpoint.trim()) && !tlsDir.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-left">
      <label className="flex flex-col gap-1.5 text-xs text-text-muted">
        Docker endpoint
        <input
          className={inputClass}
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={examples[0].value}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
        Examples:
        {examples.map((ex) => (
          <button
            key={ex.value}
            type="button"
            onClick={() => setEndpoint(ex.value)}
            title={ex.value}
            className="rounded-pill border border-border px-2 py-0.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {wantsTls && (
        <label className="flex flex-col gap-1.5 text-xs text-text-muted">
          Certificates folder (optional, for TLS)
          <input
            className={inputClass}
            value={tlsDir}
            onChange={(e) => setTlsDir(e.target.value)}
            placeholder={isWindows ? "C:\\Users\\you\\.docker\\certs" : "/home/you/.docker/certs"}
            spellCheck={false}
            autoComplete="off"
          />
          <span>Must contain ca.pem, cert.pem and key.pem.</span>
        </label>
      )}
      {plainTcp && (
        <p className="text-xs text-warning">
          Without certificates the connection is not encrypted or authenticated. Only use it on a network you trust.
        </p>
      )}

      <div className="rounded-control bg-surface-hover px-3 py-2.5 text-xs leading-relaxed text-text-muted">
        <p className="mb-1 font-medium text-text-secondary">Where do I find it?</p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>
            Run <code className="font-mono text-text-secondary">docker context ls</code>: the{" "}
            <em>Docker endpoint</em> column of the line marked * is the address to use.
          </li>
          <li>
            Or check <code className="font-mono text-text-secondary">DOCKER_HOST</code> in your terminal. Its
            certificates folder is <code className="font-mono text-text-secondary">DOCKER_CERT_PATH</code>.
          </li>
          <li>Unix sockets need an absolute path (<code className="font-mono">unix:///path/to/docker.sock</code>).</li>
        </ul>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" disabled={!endpoint.trim() || connect.isPending}>
          {connect.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
          {connect.isPending ? "Connecting..." : "Connect"}
        </Button>
      </div>
    </form>
  );
}
