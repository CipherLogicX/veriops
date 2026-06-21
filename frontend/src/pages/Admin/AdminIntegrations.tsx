import { useEffect, useState } from "react";
import { listIntegrations } from "@/services/admin.service";

interface Integration { id: string; provider: string; name: string; is_enabled: boolean; }

// Integrations live ONLY under Admin Console -> Settings -> Integrations.
// v1: structure/placeholder only — configuration & sync are not implemented yet.
const PLANNED = [
  "YouTrack", "Jira", "TestRail", "GitLab", "GitHub", "Jenkins",
  "Azure DevOps", "SMTP", "LDAP", "SSO", "Microsoft Teams", "Slack",
];

export default function AdminIntegrations() {
  const [items, setItems] = useState<Integration[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listIntegrations().then(setItems).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head"><h1>Settings · Integrations</h1></div>
      {error && <div className="error-msg">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Configured Integrations</h3>
        {items.length === 0
          ? <div className="empty">No integrations configured. (Configuration arrives in a later version.)</div>
          : (
            <table className="tq-basic-table tq-same-table">
              <thead><tr><th>Provider</th><th>Name</th><th>Enabled</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}><td>{i.provider}</td><td>{i.name}</td><td>{i.is_enabled ? "Yes" : "No"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div className="card tq-table-card">
        <h3>Available Connectors (planned)</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Structure reserved. Credentials will be stored encrypted; only admins will manage these.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PLANNED.map((p) => (
            <span key={p} className="badge b-gray" style={{ padding: "6px 12px" }}>{p}</span>
          ))}
        </div>
      </div>
    </>
  );
}
