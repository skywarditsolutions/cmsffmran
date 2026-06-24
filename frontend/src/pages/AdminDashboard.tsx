import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, type RoutingRequest } from "../lib/api";
import { clearSession } from "../lib/auth";
import { useChannel } from "../lib/useChannel";
import { RoutingTimeline } from "../components/RoutingTimeline";

export function AdminDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<any>(null);
  const [requests, setRequests] = useState<RoutingRequest[]>([]);
  const [cfg, setCfg] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [agentSearch, setAgentSearch] = useState("");

  const requestsRef = useRef<HTMLDetailsElement>(null);
  const agentsRef = useRef<HTMLDetailsElement>(null);

  const refresh = useCallback(() => {
    api.metrics().then(setMetrics).catch((e) => setError(e.message));
    api.requests().then((r) => setRequests(r.requests)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    api.getConfig().then(setCfg).catch(() => {});
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  useChannel(["admin"], () => refresh());

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    const next = await api.updateConfig({
      routingTimeoutSeconds: Number(cfg.routingTimeoutSeconds),
      maxRoutingAttempts: Number(cfg.maxRoutingAttempts),
      proximityWeight: Number(cfg.proximityWeight),
    });
    setCfg(next); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function logout() { clearSession(); navigate("/login?role=admin"); }

  function scrollToRequests() { requestsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function scrollToAgents() { if (agentsRef.current) agentsRef.current.open = true; agentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  const filteredAgents = (metrics?.agents ?? []).filter((a: any) => {
    if (!agentSearch.trim()) return true;
    const q = agentSearch.toLowerCase();
    return a.name?.toLowerCase().includes(q) || a.npn?.includes(q) ||
      a.states?.some((s: string) => s.toLowerCase().includes(q)) ||
      a.languages?.some((l: string) => l.toLowerCase().includes(q));
  });

  if (!metrics) {
    return <div className="container"><p><span className="spinner" /> Loading dashboard...</p>{error && <div className="alert error">{error}</div>}</div>;
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>CMS operations dashboard</h1>
        <button className="btn secondary" onClick={logout}>Sign out</button>
      </div>
      <p className="hint">Live view of consumer requests, agent responsiveness, and outcomes.</p>

      {/* Clickable metric boxes */}
      <div className="metric-grid">
        <div className="metric perf-clickable" onClick={scrollToRequests} role="button" tabIndex={0}>
          <div className="value">{metrics.totals.activeRequests}</div><div className="label">Active requests ↗</div>
        </div>
        <div className="metric perf-clickable" onClick={scrollToRequests} role="button" tabIndex={0}>
          <div className="value">{metrics.totals.requests}</div><div className="label">Total requests ↗</div>
        </div>
        <div className="metric perf-clickable" onClick={scrollToAgents} role="button" tabIndex={0}>
          <div className="value">{metrics.totals.activeAgents}/{metrics.totals.agents}</div><div className="label">Agents online ↗</div>
        </div>
        <div className="metric perf-clickable" onClick={scrollToRequests} role="button" tabIndex={0}>
          <div className="value">{metrics.avgResponseSeconds}</div><div className="label">Avg response (s) ↗</div>
        </div>
        <div className="metric perf-clickable" onClick={scrollToRequests} role="button" tabIndex={0}>
          <div className="value">{metrics.acceptanceRate}%</div><div className="label">Acceptance rate ↗</div>
        </div>
        <div className="metric perf-clickable" onClick={scrollToRequests} role="button" tabIndex={0}>
          <div className="value">{metrics.rerouteCount}</div><div className="label">Re-routes ↗</div>
        </div>
        {metrics.safetyNetCount > 0 && (
          <div className="metric perf-clickable" onClick={scrollToRequests} role="button" tabIndex={0}>
            <div className="value">{metrics.safetyNetCount}</div><div className="label">Safety-net ↗</div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Requests by status</h2>
        <div className="metric-grid">
          {Object.entries(metrics.byStatus).map(([s, n]) => (
            <div className="metric" key={s}>
              <div className="value">{n as number}</div>
              <div className="label"><span className={`status-badge status-${s}`}>{s}</span></div>
            </div>
          ))}
          {Object.keys(metrics.byStatus).length === 0 && <p className="hint">No requests yet.</p>}
        </div>
      </div>

      {/* Requests (renamed from Routing timeline, collapsible) */}
      <details className="card collapsible" ref={requestsRef} open>
        <summary><h2>Requests</h2><span className="collapse-icon" aria-hidden="true" /></summary>
        <p className="hint">Per-request routing history. Click a request to expand its timeline.</p>
        {requests.length === 0 && <p className="hint">No requests yet.</p>}
        {requests.map((req) => (
          <details className="request-timeline-card" key={req.requestId}>
            <summary className="request-timeline-summary">
              <span className="req-summary-left">
                <span className="req-number">#{req.number ?? ""}</span>
                <span className={`status-badge status-${req.status}`}>{req.status}</span>
                {req.safetyNet && <span className="status-badge status-SafetyNet">Safety net</span>}
              </span>
              <span className="req-summary-right">
                <span className="req-contact">{req.consumer ?? "Unknown"}{req.consumerPhone ? ` · ${req.consumerPhone}` : ""}</span>
                <span className="req-ts hint">Requested: {new Date(req.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
                {req.acceptedAt && <span className="req-ts hint">Assigned: {new Date(req.acceptedAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>}
                {!req.acceptedAt && <span className="req-ts hint">Assigned: —</span>}
              </span>
            </summary>
            <RoutingTimeline req={req} />
          </details>
        ))}
      </details>

      {/* Business rules */}
      {cfg && (
      <div className="card">
        <h2>Business rules</h2>
        <form onSubmit={saveConfig}>
          {saved && <div className="alert success" role="status">Configuration saved.</div>}
          <div className="row">
            <div>
              <label htmlFor="timeout">Referral timeout (seconds)</label>
              <input id="timeout" type="number" min={5} value={cfg.routingTimeoutSeconds} onChange={(e) => setCfg({ ...cfg, routingTimeoutSeconds: e.target.value })} />
              <span className="hint">15 min (900s) in production.</span>
            </div>
            <div>
              <label htmlFor="attempts">Max routing attempts</label>
              <input id="attempts" type="number" min={1} value={cfg.maxRoutingAttempts} onChange={(e) => setCfg({ ...cfg, maxRoutingAttempts: e.target.value })} />
            </div>
            <div>
              <label htmlFor="prox">Proximity weight (0-1)</label>
              <input id="prox" type="number" step="0.1" min={0} max={1} value={cfg.proximityWeight} onChange={(e) => setCfg({ ...cfg, proximityWeight: e.target.value })} />
              <span className="hint">Higher favors closer agents.</span>
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}><button className="btn" type="submit">Save configuration</button></div>
        </form>
      </div>
      )}

      {/* Agents & brokers with search */}
      <details className="card collapsible" ref={agentsRef}>
        <summary><h2>Agents &amp; brokers</h2><span className="collapse-icon" aria-hidden="true" /></summary>
        <div className="row" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="Search by name, NPN, state, or language..."
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            style={{ flex: 1, maxWidth: "400px" }}
            aria-label="Search agents"
          />
          <span className="hint">{filteredAgents.length} of {metrics.agents.length}</span>
        </div>
        <table>
          <thead>
            <tr><th>NPN</th><th>Name</th><th>States</th><th>Languages</th><th>Status</th><th>Load</th><th></th></tr>
          </thead>
          <tbody>
            {filteredAgents.map((a: any) => (
              <tr key={a.npn} className="agent-row" onClick={() => navigate(`/admin/agent/${a.npn}`)} style={{ cursor: "pointer" }}>
                <td>{a.npn}</td>
                <td>{a.name}</td>
                <td>{a.states?.join(", ")}</td>
                <td>{a.languages?.join(", ")}</td>
                <td><span className={`status-badge status-${a.status === "online" ? "Accepted" : "NotGoodReferral"}`}>{a.status}</span></td>
                <td>{a.currentLoad}/{a.maxLoad}</td>
                <td><span className="hint">View →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {/* Compliance flags */}
      {metrics.compliance && metrics.compliance.flaggedAgents.length > 0 && (
        <details className="card collapsible">
          <summary><h2>Compliance flags</h2><span className="collapse-icon" aria-hidden="true" /></summary>
          <p className="hint">
            Agents at risk of deactivation per HOD policy: consistent missed referrals
            (threshold {metrics.compliance.thresholds.missedReferralDeactivationThreshold}),
            password older than {metrics.compliance.thresholds.passwordRotationDays} days,
            or lapsed annual training.
          </p>
          <table>
            <thead><tr><th>NPN</th><th>Name</th><th>Missed</th><th>Deactivation risk</th><th>Password stale</th><th>Training lapsed</th><th></th></tr></thead>
            <tbody>
              {metrics.compliance.flaggedAgents.map((a: any) => (
                <tr key={a.npn} className="agent-row" onClick={() => navigate(`/admin/agent/${a.npn}`)} style={{ cursor: "pointer" }}>
                  <td>{a.npn}</td><td>{a.name}</td><td>{a.flags.missedReferrals}</td>
                  <td>{a.flags.deactivationRisk ? "Yes" : "—"}</td>
                  <td>{a.flags.passwordStale ? "Yes" : "—"}</td>
                  <td>{a.flags.trainingLapsed ? "Yes" : "—"}</td>
                  <td><span className="hint">View →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
