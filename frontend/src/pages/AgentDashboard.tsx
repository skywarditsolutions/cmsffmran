import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getSession, clearSession } from "../lib/auth";
import { useChannel } from "../lib/useChannel";

interface Referral { requestId: string; state: string; zip: string; language: string; city?: string; timeoutSeconds: number; receivedAt: number; }
interface SafetyNetReferral { requestId: string; state: string; zip: string; language: string; city?: string; receivedAt: number; }
interface ActiveCase { requestId: string; consumer: { firstName: string; lastName: string; phone: string; email?: string; phoneType?: string; preferredContactMethod?: string }; zip: string; language: string; status: string; acceptedAt?: string; safetyNet?: boolean; }
interface MissedReferral { requestId: string; state: string; language: string; notifiedAt: string; resolvedAt?: string; }
interface AgentStats { acceptedToday: number; totalAccepted: number; avgResponseSeconds: number; activeLoad: number; maxLoad: number; missedReferralCount: number; online: boolean; }
interface AvailabilityWindow { day: number; start: string; end: string; }
interface HistoryEntry { requestId: string; state: string; language: string; zip: string; outcome: string; notifiedAt: string; resolvedAt?: string; safetyNet: boolean; requestStatus: string; }
interface AdminMsg { id: string; from: string; message: string; sentAt: string; channel: string; }

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const OUTCOME_LABELS: Record<string, string> = { accepted: "Accepted", timeout: "Missed", rejected: "Rejected", notified: "Notified" };
type HistoryFilter = "all" | "accepted" | "timeout" | "rejected" | "safetynet";

function schedulesEqual(a: AvailabilityWindow[], b: AvailabilityWindow[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (arr: AvailabilityWindow[]) => [...arr].sort((x, y) => x.day - y.day).map((s) => `${s.day}:${s.start}:${s.end}`);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay.getDay(); i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AgentDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [online, setOnline] = useState(true);
  const [incoming, setIncoming] = useState<Referral[]>([]);
  const [safetyNet, setSafetyNet] = useState<SafetyNetReferral[]>([]);
  const [cases, setCases] = useState<ActiveCase[]>([]);
  const [missed, setMissed] = useState<MissedReferral[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [todayOn, setTodayOn] = useState(false);
  const [todayStop, setTodayStop] = useState("");
  const [oooFrom, setOooFrom] = useState("");
  const [oooUntil, setOooUntil] = useState("");
  const [todaySaved, setTodaySaved] = useState(false);
  const [oooSaved, setOooSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [schedule, setSchedule] = useState<AvailabilityWindow[]>([]);
  const [originalSchedule, setOriginalSchedule] = useState<AvailabilityWindow[]>([]);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<string[]>([]);
  const [notifSaved, setNotifSaved] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [histFilter, setHistFilter] = useState<HistoryFilter>("all");
  const [histSortCol, setHistSortCol] = useState("notifiedAt");
  const [histSortDir, setHistSortDir] = useState<"asc" | "desc">("desc");
  const [histOpen, setHistOpen] = useState(false);
  const [adminMessages, setAdminMessages] = useState<AdminMsg[]>([]);
  const historyRef = useRef<HTMLDetailsElement>(null);
  const referralsRef = useRef<HTMLDivElement>(null);
  const servingRef = useRef<HTMLDivElement>(null);
  const availRef = useRef<HTMLDetailsElement>(null);

  const timezone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } }, []);
  const scheduleModified = !schedulesEqual(schedule, originalSchedule);
  const today = new Date();
  const maxCalDate = new Date(today.getFullYear(), today.getMonth() + 12, 1);
  const canGoPrev = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth());
  const canGoNext = calYear < maxCalDate.getFullYear() || (calYear === maxCalDate.getFullYear() && calMonth < maxCalDate.getMonth());

  const refreshStats = useCallback(() => {
    api.agentStats().then(setStats).catch(() => {});
    api.agentHistory().then((r) => setHistory(r.history)).catch(() => {});
  }, []);

  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p); setOnline(p.status === "online");
      setTodayOn(p.todayAvailability?.accepting ?? false);
      setTodayStop(p.todayAvailability?.stopReferralsAt?.slice(0, 16) ?? "");
      setOooFrom(p.outOfOfficeFrom?.slice(0, 10) ?? "");
      setOooUntil(p.outOfOfficeUntil?.slice(0, 10) ?? "");
      const avail = p.availability ?? []; setSchedule(avail); setOriginalSchedule(avail);
      setNotifPrefs(p.notificationPrefs ?? ["sms", "email"]);
      setAdminMessages(p.adminMessages ?? []);
    }).catch((e) => setError(e.message));
    api.missedReferrals().then((r) => setMissed(r.missed)).catch(() => {});
    refreshStats();
  }, [refreshStats]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  useChannel(session?.npn ? [session.npn] : [], (msg) => {
    if (msg.type === "referral") setIncoming((prev) => prev.some((r) => r.requestId === msg.payload.requestId) ? prev : [...prev, { ...msg.payload, receivedAt: Date.now() }]);
    if (msg.type === "safetyNetReferral") setSafetyNet((prev) => prev.some((r) => r.requestId === msg.payload.requestId) ? prev : [...prev, { ...msg.payload, receivedAt: Date.now() }]);
    if (msg.type === "referralExpired") setIncoming((prev) => prev.filter((r) => r.requestId !== msg.payload.requestId));
    if (msg.type === "referralMissed") { api.missedReferrals().then((r) => setMissed(r.missed)).catch(() => {}); refreshStats(); }
    if (msg.type === "safetyNetClosed") setSafetyNet((prev) => prev.filter((r) => r.requestId !== msg.payload.requestId));
    if (msg.type === "adminNotification") setAdminMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, from: msg.payload.from ?? "CMS Admin", message: msg.payload.message, sentAt: new Date().toISOString(), channel: "push" }]);
  });

  async function toggleOnline() { const next = online ? "offline" : "online"; await api.setOnline(next); setOnline(!online); refreshStats(); }
  async function saveTodayAvailability() { try { const stop = todayOn && todayStop ? new Date(todayStop).toISOString() : null; await api.setTodayAvailability({ accepting: todayOn, stopReferralsAt: stop }); setTodaySaved(true); setSaveError(""); setTimeout(() => setTodaySaved(false), 2500); } catch (e) { setSaveError((e as Error).message); } }
  async function saveOutOfOffice() { try { const from = oooFrom ? new Date(oooFrom + "T00:00:00").toISOString() : null; const until = oooUntil ? new Date(oooUntil + "T23:59:59").toISOString() : null; await api.setOutOfOffice(from, until); setOooSaved(true); setSaveError(""); setTimeout(() => setOooSaved(false), 2500); } catch (e) { setSaveError((e as Error).message); } }
  async function saveSchedule() { try { await api.updateProfile({ availability: schedule }); setOriginalSchedule(schedule); setScheduleSaved(true); setSaveError(""); setTimeout(() => setScheduleSaved(false), 2500); } catch (e) { setSaveError((e as Error).message); } }
  async function saveNotifPrefs() { try { await api.updateProfile({ notificationPrefs: notifPrefs }); setNotifSaved(true); setSaveError(""); setTimeout(() => setNotifSaved(false), 2500); } catch (e) { setSaveError((e as Error).message); } }
  function toggleDay(day: number) { const existing = schedule.find((s) => s.day === day); if (existing) setSchedule(schedule.filter((s) => s.day !== day)); else setSchedule([...schedule, { day, start: "08:00", end: "18:00" }]); }
  function updateDayTime(day: number, field: "start" | "end", value: string) { setSchedule(schedule.map((s) => (s.day === day ? { ...s, [field]: value } : s))); }
  function toggleNotifPref(pref: string) { setNotifPrefs((prev) => prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]); }
  function handleCalendarDayClick(day: number) { const clicked = toDateString(new Date(calYear, calMonth, day)); if (!oooFrom || (oooFrom && oooUntil)) { setOooFrom(clicked); setOooUntil(""); } else if (oooFrom && !oooUntil) { if (clicked >= oooFrom) setOooUntil(clicked); else setOooFrom(clicked); } }
  function prevMonth() { if (!canGoPrev) return; if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }
  function nextMonth() { if (!canGoNext) return; if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }
  function scrollTo(ref: React.RefObject<HTMLElement | null>) { ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function clickMissed() { setHistFilter("timeout"); setHistOpen(true); setTimeout(() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }
  function sortHistory(col: string) { if (histSortCol === col) setHistSortDir(histSortDir === "asc" ? "desc" : "asc"); else { setHistSortCol(col); setHistSortDir("asc"); } }

  const filteredHistory = useMemo(() => {
    let result = history;
    if (histFilter === "safetynet") result = history.filter((h) => h.safetyNet);
    else if (histFilter !== "all") result = history.filter((h) => h.outcome === histFilter);
    return [...result].sort((a, b) => { const av = a[histSortCol as keyof HistoryEntry] ?? ""; const bv = b[histSortCol as keyof HistoryEntry] ?? ""; const cmp = String(av).localeCompare(String(bv)); return histSortDir === "asc" ? cmp : -cmp; });
  }, [history, histFilter, histSortCol, histSortDir]);

  async function accept(referral: Referral | SafetyNetReferral, isSafetyNet: boolean) {
    try { const res = await api.acceptReferral(referral.requestId); if (isSafetyNet) setSafetyNet((prev) => prev.filter((r) => r.requestId !== referral.requestId)); else setIncoming((prev) => prev.filter((r) => r.requestId !== referral.requestId)); setCases((prev) => [{ requestId: referral.requestId, consumer: res.consumer, zip: res.zip, language: res.language, status: "Accepted", acceptedAt: new Date().toISOString(), safetyNet: res.safetyNet }, ...prev]); refreshStats(); }
    catch (e) { setError((e as Error).message); if (isSafetyNet) setSafetyNet((prev) => prev.filter((r) => r.requestId !== referral.requestId)); else setIncoming((prev) => prev.filter((r) => r.requestId !== referral.requestId)); }
  }
  async function reject(referral: Referral) { await api.rejectReferral(referral.requestId).catch(() => {}); setIncoming((prev) => prev.filter((r) => r.requestId !== referral.requestId)); }
  async function setStatus(c: ActiveCase, status: string) { await api.updateReferralStatus(c.requestId, status); setCases((prev) => prev.map((x) => (x.requestId === c.requestId ? { ...x, status } : x))); refreshStats(); }
  function logout() { clearSession(); navigate("/login?role=agent"); }
  async function dismissAdminMessage(id: string) { setAdminMessages((prev) => prev.filter((m) => m.id !== id)); try { await api.dismissMessage(id); } catch {} }

  const initials = (profile?.name ?? session?.email ?? "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const calCells = buildCalendar(calYear, calMonth);
  const todayDate = today.getDate(), todayMonth = today.getMonth(), todayYear = today.getFullYear();
  const trainingLastVerified = "2025-01-15", trainingDueNext = "2026-01-15";
  const loginFormatted = session?.loginAt ? new Date(session.loginAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : null;

  function isCellBlocked(day: number): boolean {
    if (!oooFrom) return false;
    const cellDateStr = toDateString(new Date(calYear, calMonth, day));
    if (oooUntil) return cellDateStr >= oooFrom && cellDateStr <= oooUntil;
    return cellDateStr === oooFrom;
  }
  const sortIndicator = (col: string) => histSortCol === col ? (histSortDir === "asc" ? " ↑" : " ↓") : "";
  const newReferrals = incoming.length + safetyNet.length;
  const activeCases = cases.filter((c) => c.status !== "Completed" && c.status !== "NotGoodReferral").length;

  return (
    <div className="agent-layout">
      {/* ============ SIDEBAR ============ */}
      <aside className="agent-sidebar">
        {/* Profile identity */}
        <div className="sidebar-card sidebar-profile">
          <div className="sidebar-avatar" aria-hidden="true">{initials}</div>
          <div className="sidebar-name">{profile?.name ?? session?.email}</div>
          <div className="sidebar-npn">NPN {session?.npn}</div>
          <div className="sidebar-states">
            {(profile?.activeStates ?? []).map((s: string) => <span className="state-badge" key={s}>{s}</span>)}
          </div>
          <button className={`status-toggle ${online ? "online" : "offline"}`} onClick={toggleOnline} aria-pressed={online}>
            <span className="status-dot" />{online ? "Online" : "Offline"}
          </button>
          <div className="sidebar-langs hint">
            {profile?.languages?.join(", ")} <em>(MLMS-managed)</em>
          </div>
        </div>

        {/* Performance stats */}
        <div className="sidebar-card">
          <div className="sidebar-card-title">Your performance</div>
          <div className="sidebar-stat-list">
            <div className="sidebar-stat-row"><span>Accepted today</span><strong>{stats?.acceptedToday ?? 0}</strong></div>
            <div className="sidebar-stat-row"><span>Avg response</span><strong>{stats?.avgResponseSeconds ?? 0}s</strong></div>
            <div className="sidebar-stat-row"><span>Total accepted</span><strong>{stats?.totalAccepted ?? 0}</strong></div>
            <div className={`sidebar-stat-row ${stats && stats.missedReferralCount > 0 ? "stat-warn" : ""}`}>
              <span>Missed</span>
              <strong className={stats && stats.missedReferralCount > 0 ? "clickable" : ""} onClick={stats && stats.missedReferralCount > 0 ? clickMissed : undefined}>
                {stats?.missedReferralCount ?? 0}{stats && stats.missedReferralCount > 0 ? " ↗" : ""}
              </strong>
            </div>
          </div>
        </div>

        {/* Training status */}
        <div className="sidebar-card">
          <div className="sidebar-card-title">Annual training</div>
          <div className="sidebar-stat-list">
            <div className="sidebar-stat-row"><span>Last verified</span><strong>{new Date(trainingLastVerified).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong></div>
            <div className="sidebar-stat-row"><span>Due next</span><strong style={{ color: profile?.trainingCurrent === false ? "var(--red)" : undefined }}>{new Date(trainingDueNext).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong></div>
            <div className="sidebar-stat-row"><span>Status</span><span className={`status-badge ${profile?.trainingCurrent ? "status-Accepted" : "status-NotGoodReferral"}`}>{profile?.trainingCurrent ? "Current" : "Lapsed"}</span></div>
          </div>
          <a href="https://marketplace.cms.gov/training" target="_blank" rel="noopener noreferrer" className="sidebar-link">Go to training portal →</a>
        </div>

        {/* Messages from admin */}
        {adminMessages.length > 0 && (
          <div className="sidebar-card sidebar-messages">
            <div className="sidebar-card-title">
              Messages from admin
              <span className="nav-badge">{adminMessages.length}</span>
            </div>
            <div className="admin-msg-list">
              {adminMessages.map((m) => (
                <div className="admin-msg" key={m.id}>
                  <div className="admin-msg-header">
                    <span className="admin-msg-from">{m.from}</span>
                    <button className="admin-msg-dismiss" onClick={() => dismissAdminMessage(m.id)} aria-label="Dismiss">×</button>
                  </div>
                  <p className="admin-msg-text">{m.message}</p>
                  <div className="admin-msg-meta hint">
                    {new Date(m.sentAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })} · {m.channel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick navigation */}
        <div className="sidebar-card sidebar-nav">
          <button className="nav-link" onClick={() => scrollTo(referralsRef)}>Incoming referrals{newReferrals > 0 && <span className="nav-badge">{newReferrals}</span>}</button>
          <button className="nav-link" onClick={() => scrollTo(servingRef)}>Currently serving{activeCases > 0 && <span className="nav-badge">{activeCases}</span>}</button>
          <button className="nav-link" onClick={() => { if (availRef.current) availRef.current.open = true; scrollTo(availRef); }}>Availability</button>
          <button className="nav-link" onClick={() => { setHistOpen(true); setTimeout(() => scrollTo(historyRef), 100); }}>Referral history</button>
        </div>

        {/* Last login */}
        {loginFormatted && <div className="sidebar-footer hint">Last login: {loginFormatted}<br />{timezone}</div>}
        <button className="btn secondary sidebar-signout" onClick={logout}>Sign out</button>
      </aside>

      {/* ============ MAIN CONTENT ============ */}
      <main className="agent-main">
        {/* Alerts */}
        {error && <div className="alert error" role="alert">{error}</div>}
        {missed.length > 0 && (
          <div className="alert error" role="alert">
            <strong>You missed {missed.length} referral{missed.length === 1 ? "" : "s"}.</strong> Consistently missing the 15-minute window may result in deactivation. Recent: {missed.slice(0, 3).map((m) => m.requestId.slice(-6)).join(", ")}.
          </div>
        )}

        {/* Incoming referrals */}
        <section ref={referralsRef} className="main-section">
          <h2 className="section-title">Incoming referrals</h2>
          {incoming.length === 0 && safetyNet.length === 0 && <p className="hint">{online ? "Waiting for new referrals..." : "You are offline. Go online to receive referrals."}</p>}
          {incoming.map((r) => {
            const remaining = Math.max(0, Math.ceil((r.receivedAt + r.timeoutSeconds * 1000 - now) / 1000));
            const pct = r.timeoutSeconds > 0 ? (remaining / r.timeoutSeconds) * 100 : 0;
            const urgency = pct > 50 ? "green" : pct > 25 ? "amber" : "red";
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.zip)}`;
            return (
              <div className={`referral-card urgency-${urgency}`} key={r.requestId} role="alert">
                <div className="referral-header">
                  <div><strong>New referral</strong><span className={`urgency-badge urgency-${urgency}`}>{remaining}s remaining</span></div>
                  <div className="referral-location">{r.language} speaker{r.city ? ` in ${r.city}, ${r.state}` : ` in ${r.state}`} (ZIP {r.zip}) <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="map-link">View map</a></div>
                </div>
                <div className="countdown-bar"><div className={`countdown-fill urgency-${urgency}`} style={{ width: `${pct}%` }} /></div>
                <div className="hint">Consumer details are hidden until you accept (PII protection).</div>
                <div className="row" style={{ marginTop: "0.75rem" }}><button className="btn success" onClick={() => accept(r, false)}>Accept</button><button className="btn secondary" onClick={() => reject(r)}>Reject</button></div>
              </div>
            );
          })}
          {safetyNet.length > 0 && (
            <div className="safetynet-group">
              <h3 className="subsection-title">Safety-net referrals <span className="hint">(after-hours, first-come, no penalty)</span></h3>
              {safetyNet.map((r) => {
                const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.zip)}`;
                return (
                  <div className="referral-card safetynet" key={r.requestId} role="alert">
                    <div className="referral-header"><div><strong>Safety-net referral</strong></div><div className="referral-location">{r.language} speaker{r.city ? ` in ${r.city}, ${r.state}` : ` in ${r.state}`} (ZIP {r.zip}) <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="map-link">View map</a></div></div>
                    <div className="hint">No agent was on duty. Be the first to accept. No countdown, no penalty.</div>
                    <div className="row" style={{ marginTop: "0.75rem" }}><button className="btn success" onClick={() => accept(r, true)}>Accept</button></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Currently serving */}
        <section ref={servingRef} className="main-section">
          <h2 className="section-title">Currently serving</h2>
          {cases.length === 0 && <p className="hint">No accepted referrals yet.</p>}
          {cases.map((c) => {
            const acceptedMs = c.acceptedAt ? Date.parse(c.acceptedAt) : 0;
            const stale = c.status === "Accepted" && now - acceptedMs > DAY_MS;
            const steps = ["Accepted", "InProgress", "Completed"];
            const currentStep = steps.indexOf(c.status);
            const isTerminal = c.status === "Completed" || c.status === "NotGoodReferral";
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.zip)}`;
            return (
              <div className="case-card" key={c.requestId}>
                <div className="case-header"><div className="case-name">{c.consumer.firstName} {c.consumer.lastName}{c.safetyNet && <span className="status-badge status-SafetyNet">Safety net</span>}</div><span className={`status-badge status-${c.status}`}>{c.status}</span></div>
                <div className="contact-callout">
                  <div className="contact-item"><span className="contact-icon">Phone</span><span>{c.consumer.phone}{c.consumer.phoneType ? ` (${c.consumer.phoneType})` : ""}</span></div>
                  {c.consumer.email && <div className="contact-item"><span className="contact-icon">Email</span><span>{c.consumer.email}</span></div>}
                  <div className="contact-item"><span className="contact-icon">Prefers</span><span>{c.consumer.preferredContactMethod ?? "Phone"}</span></div>
                  <div className="contact-item"><span className="contact-icon">Location</span><span>{c.language} speaker, ZIP {c.zip} <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="map-link">map</a></span></div>
                </div>
                <div className="stepper">
                  {steps.map((step, i) => (<div key={step} className={`stepper-step ${i < currentStep ? "done" : i === currentStep ? "current" : ""} ${isTerminal && i === currentStep ? "done" : ""}`}><div className="stepper-dot" /><div className="stepper-label">{step === "InProgress" ? "In progress" : step}</div></div>))}
                  {c.status === "NotGoodReferral" && <div className="stepper-step done"><div className="stepper-dot rejected" /><div className="stepper-label">Not a good referral</div></div>}
                </div>
                {stale && <div className="alert error" style={{ marginTop: "0.5rem" }}>Reminder: this referral has been in Accepted status for over 24 hours. Update its status or contact the consumer.</div>}
                <div className="row" style={{ marginTop: "0.75rem" }}>
                  {c.status === "Accepted" && <button className="btn" onClick={() => setStatus(c, "InProgress")}>Start working</button>}
                  {c.status === "InProgress" && <button className="btn success" onClick={() => setStatus(c, "Completed")}>Mark completed</button>}
                  {c.status !== "Completed" && c.status !== "NotGoodReferral" && <button className="btn danger" onClick={() => setStatus(c, "NotGoodReferral")}>Not a good referral</button>}
                </div>
              </div>
            );
          })}
        </section>

        {/* Availability (collapsible) */}
        <details className="availability-section collapsible" ref={availRef} open>
          <summary><h2 className="section-title">Availability</h2><span className="collapse-icon" aria-hidden="true" /></summary>
          <div className="availability-body">
            {saveError && <div className="alert error" role="alert">{saveError}</div>}

            <div className="availability-card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>Your Current Weekly schedule <span className="hint">({timezone})</span></strong>
                <button className="btn secondary" onClick={saveSchedule} disabled={!scheduleModified}>Save schedule</button>
              </div>
              {scheduleSaved && <span className="save-feedback">Schedule saved</span>}
              <div className="schedule-grid">
                {DAY_LABELS.map((dayLabel, i) => {
                  const entry = schedule.find((s) => s.day === i);
                  return (
                    <div className={`schedule-day ${entry ? "active" : ""}`} key={i}>
                      <label className="schedule-toggle"><input type="checkbox" checked={!!entry} onChange={() => toggleDay(i)} /><span>{dayLabel}</span></label>
                      {entry && <div className="schedule-times"><input type="time" value={entry.start} onChange={(e) => updateDayTime(i, "start", e.target.value)} aria-label={`${dayLabel} start`} /><span className="hint">to</span><input type="time" value={entry.end} onChange={(e) => updateDayTime(i, "end", e.target.value)} aria-label={`${dayLabel} end`} /></div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="availability-card">
              <label htmlFor="todayOn">Today's availability override</label>
              <div className="availability-grid">
                <div><select id="todayOn" value={todayOn ? "on" : "off"} onChange={(e) => setTodayOn(e.target.value === "on")}><option value="off">Off (standard hours only)</option><option value="on">On - accept until a stop time</option></select></div>
                <div><label htmlFor="todayStop" className="hint">Stop at</label><input id="todayStop" type="datetime-local" value={todayStop} disabled={!todayOn} onChange={(e) => setTodayStop(e.target.value)} /></div>
                <button className="btn secondary" onClick={saveTodayAvailability}>Save</button>
              </div>
              {todaySaved && <span className="save-feedback">Saved</span>}
            </div>

            <div className="availability-card">
              <label>Out of Office</label>
              <div className="ooo-form">
                <div><label htmlFor="oooFrom" className="hint">From</label><input id="oooFrom" type="date" value={oooFrom} onChange={(e) => setOooFrom(e.target.value)} /></div>
                <div><label htmlFor="oooUntil" className="hint">To</label><input id="oooUntil" type="date" value={oooUntil} onChange={(e) => setOooUntil(e.target.value)} /></div>
                <button className="btn secondary" onClick={saveOutOfOffice}>Save</button>
                {(oooFrom || oooUntil) && <button className="btn secondary" onClick={() => { setOooFrom(""); setOooUntil(""); api.setOutOfOffice(null, null); setOooSaved(true); setTimeout(() => setOooSaved(false), 2500); }}>Clear</button>}
              </div>
              {oooSaved && <span className="save-feedback">Saved</span>}
              <div className="hint" style={{ marginTop: "0.5rem" }}>Click a day to set From, then click another for To.</div>
              <div className="calendar">
                <div className="calendar-nav"><button className="cal-nav-btn" onClick={prevMonth} disabled={!canGoPrev} aria-label="Previous">‹</button><div className="calendar-header">{MONTH_NAMES[calMonth]} {calYear}</div><button className="cal-nav-btn" onClick={nextMonth} disabled={!canGoNext} aria-label="Next">›</button></div>
                <div className="calendar-grid">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div className="calendar-dow" key={i}>{d}</div>)}
                  {calCells.map((day, i) => {
                    if (day === null) return <div className="calendar-cell empty" key={i} />;
                    const isToday = calYear === todayYear && calMonth === todayMonth && day === todayDate;
                    const blocked = isCellBlocked(day);
                    const isFromEdge = oooFrom && toDateString(new Date(calYear, calMonth, day)) === oooFrom;
                    const isToEdge = oooUntil && toDateString(new Date(calYear, calMonth, day)) === oooUntil;
                    return <button className={`calendar-cell ${isToday ? "today" : ""} ${blocked ? "ooo-blocked" : ""} ${isFromEdge || isToEdge ? "ooo-edge" : ""}`} key={i} onClick={() => handleCalendarDayClick(day)} aria-label={`${MONTH_NAMES[calMonth]} ${day}, ${calYear}`}>{day}</button>;
                  })}
                </div>
              </div>
            </div>

            <div className="availability-card">
              <label>Notification preferences</label>
              <div className="notif-prefs">
                {(["sms", "email", "push"] as const).map((pref) => (<label className="checkbox-row" key={pref}><input type="checkbox" checked={notifPrefs.includes(pref)} onChange={() => toggleNotifPref(pref)} /><span>{pref === "sms" ? "SMS text" : pref === "email" ? "Email" : "Push notification"}</span></label>))}
              </div>
              <div style={{ marginTop: "0.75rem" }}><button className="btn secondary" onClick={saveNotifPrefs}>Save preferences</button>{notifSaved && <span className="save-feedback" style={{ marginLeft: "0.75rem" }}>Saved</span>}</div>
            </div>
          </div>
        </details>

        {/* Referral history */}
        <details className="card collapsible" ref={historyRef} open={histOpen} onToggle={(e) => setHistOpen((e.target as HTMLDetailsElement).open)}>
          <summary><h2 className="section-title">Referral history</h2><span className="collapse-icon" aria-hidden="true" /></summary>
          {history.length === 0 ? <p className="hint">No prior referrals.</p> : (
            <>
              <div className="row" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
                <label className="hint" htmlFor="histFilter">Filter:</label>
                <select id="histFilter" value={histFilter} onChange={(e) => setHistFilter(e.target.value as HistoryFilter)} style={{ width: "auto" }}>
                  <option value="all">All</option><option value="accepted">Accepted</option><option value="timeout">Missed</option><option value="rejected">Rejected</option><option value="safetynet">Safety net</option>
                </select>
                <span className="hint" style={{ marginLeft: "auto" }}>{filteredHistory.length} of {history.length}</span>
              </div>
              <table>
                <thead><tr>
                  <th className="sortable" onClick={() => sortHistory("requestId")}>Request{sortIndicator("requestId")}</th>
                  <th className="sortable" onClick={() => sortHistory("state")}>State{sortIndicator("state")}</th>
                  <th className="sortable" onClick={() => sortHistory("language")}>Language{sortIndicator("language")}</th>
                  <th className="sortable" onClick={() => sortHistory("outcome")}>Outcome{sortIndicator("outcome")}</th>
                  <th>Safety net</th>
                  <th className="sortable" onClick={() => sortHistory("notifiedAt")}>Notified{sortIndicator("notifiedAt")}</th>
                  <th className="sortable" onClick={() => sortHistory("resolvedAt")}>Resolved{sortIndicator("resolvedAt")}</th>
                </tr></thead>
                <tbody>
                  {filteredHistory.map((h, i) => (
                    <tr key={i}>
                      <td><span className="req-id">{h.requestId.slice(-8)}</span></td><td>{h.state}</td><td>{h.language}</td>
                      <td><span className={`status-badge status-${h.outcome === "accepted" ? "Accepted" : h.outcome === "timeout" ? "NotGoodReferral" : "Queued"}`}>{OUTCOME_LABELS[h.outcome] ?? h.outcome}</span></td>
                      <td>{h.safetyNet ? "Yes" : "—"}</td>
                      <td className="hint">{new Date(h.notifiedAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="hint">{h.resolvedAt ? new Date(h.resolvedAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </details>
      </main>
    </div>
  );
}
