import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { clearSession } from "../lib/auth";

export function AgentDetailPage() {
  const { npn } = useParams<{ npn: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<any>(null);
  const [error, setError] = useState("");
  const [notifyChannel, setNotifyChannel] = useState<"sms" | "email" | "push">("push");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [notifyStatus, setNotifyStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!npn) return;
    api.getAgent(npn).then(setAgent).catch((e) => setError(e.message));
  }, [npn]);

  function logout() { clearSession(); navigate("/login?role=admin"); }

  async function sendNotification() {
    if (!npn || !notifyMessage.trim()) return;
    setSending(true);
    setNotifyStatus(null);
    try {
      await api.notifyAgent(npn, notifyChannel, notifyMessage);
      setNotifyStatus({ type: "success", msg: `${notifyChannel.toUpperCase()} notification sent successfully.` });
      setNotifyMessage("");
    } catch (e) {
      setNotifyStatus({ type: "error", msg: (e as Error).message });
    }
    setSending(false);
  }

  if (error) return <div className="container"><div className="alert error">{error}</div><button className="btn secondary" onClick={() => navigate("/admin")}>Back to dashboard</button></div>;
  if (!agent) return <div className="container"><p><span className="spinner" /> Loading agent...</p></div>;

  const initials = agent.name?.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() ?? "?";

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <button className="btn secondary" onClick={() => navigate("/admin")}>← Back to dashboard</button>
        <button className="btn secondary" onClick={logout}>Sign out</button>
      </div>

      <div className="profile-card">
        <div className="profile-main">
          <div className="profile-avatar" aria-hidden="true">{initials}</div>
          <div className="profile-info">
            <div className="profile-name">{agent.name}</div>
            <div className="profile-npn">NPN {agent.npn}</div>
            <div className="profile-badges">
              {agent.activeStates?.map((s: string) => <span className="state-badge" key={s}>{s}</span>)}
            </div>
            <div className="hint" style={{ marginTop: "0.3rem" }}>
              {agent.email} · {agent.phone}
            </div>
          </div>
          <span className={`status-badge ${agent.status === "online" ? "status-Accepted" : "status-NotGoodReferral"}`}>
            {agent.status}
          </span>
        </div>
      </div>

      <div className="perf-grid">
        <div className="perf-stat"><div className="perf-value">{agent.currentLoad}/{agent.maxLoad}</div><div className="perf-label">Active load</div></div>
        <div className="perf-stat"><div className="perf-value">{agent.missedReferralCount}</div><div className="perf-label">Missed</div></div>
        <div className={`perf-stat ${agent.trainingCurrent ? "" : "perf-warn"}`}>
          <div className="perf-value">{agent.trainingCurrent ? "Yes" : "No"}</div><div className="perf-label">Training current</div>
        </div>
      </div>

      <div className="card">
        <h2>Licensure &amp; languages</h2>
        <div className="row" style={{ gap: "2rem" }}>
          <div>
            <div className="hint">Licensed states</div>
            <div style={{ fontWeight: 600 }}>{agent.licensedStates?.join(", ")}</div>
          </div>
          <div>
            <div className="hint">Active states</div>
            <div style={{ fontWeight: 600 }}>{agent.activeStates?.join(", ")}</div>
          </div>
          <div>
            <div className="hint">Languages</div>
            <div style={{ fontWeight: 600 }}>{agent.languages?.join(", ")}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Availability</h2>
        {agent.availability?.length > 0 ? (
          <table>
            <thead><tr><th>Day</th><th>Start</th><th>End</th></tr></thead>
            <tbody>
              {agent.availability.map((a: { day: number; start: string; end: string }, i: number) => (
                <tr key={i}><td>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][a.day]}</td><td>{a.start}</td><td>{a.end}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="hint">No standard schedule set.</p>}
        {agent.outOfOfficeUntil && (
          <div className="alert error" style={{ marginTop: "0.5rem" }}>
            Out of Office{agent.outOfOfficeFrom ? ` from ${new Date(agent.outOfOfficeFrom).toLocaleDateString()}` : ""} until {new Date(agent.outOfOfficeUntil).toLocaleDateString()}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Send notification</h2>
        <p className="hint">Push a custom message to this agent via their preferred channel.</p>
        {notifyStatus && (
          <div className={`alert ${notifyStatus.type === "success" ? "success" : "error"}`} role="status">
            {notifyStatus.msg}
          </div>
        )}
        <div className="row" style={{ alignItems: "flex-end", gap: "1rem" }}>
          <div>
            <label htmlFor="channel">Channel</label>
            <select id="channel" value={notifyChannel} onChange={(e) => setNotifyChannel(e.target.value as "sms" | "email" | "push")}>
              <option value="push">Push (real-time)</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="message">Message</label>
            <textarea
              id="message"
              rows={3}
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
              placeholder="Type your notification message..."
              style={{ width: "100%", padding: "0.6rem", border: "2px solid var(--gray-600)", borderRadius: "var(--radius)", fontSize: "1rem", resize: "vertical" }}
            />
          </div>
          <button className="btn" onClick={sendNotification} disabled={sending || !notifyMessage.trim()}>
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
        <div className="hint" style={{ marginTop: "0.5rem" }}>
          Agent's notification preferences: {agent.notificationPrefs?.join(", ") || "none set"}
        </div>
      </div>
    </div>
  );
}
