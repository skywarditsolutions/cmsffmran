import type { RoutingRequest, RoutingAttempt } from "../lib/api";

function time(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString() : "";
}

function secondsBetween(a?: string, b?: string): string {
  if (!a || !b) return "";
  return `${Math.round((Date.parse(b) - Date.parse(a)) / 1000)}s`;
}

const OUTCOME_LABEL: Record<RoutingAttempt["outcome"], string> = {
  notified: "Awaiting response",
  accepted: "Accepted",
  rejected: "Rejected",
  timeout: "Timed out — rerouted",
};

function finalNode(req: RoutingRequest) {
  switch (req.status) {
    case "Accepted":
    case "InProgress":
      return { cls: "accepted", text: `Accepted${req.acceptedAt ? ` at ${time(req.acceptedAt)}` : ""}` };
    case "Completed":
      return { cls: "accepted", text: `Enrollment completed${req.completedAt ? ` at ${time(req.completedAt)}` : ""}` };
    case "NotGoodReferral":
      return { cls: "rejected", text: "Marked not a good referral" };
    case "Queued":
      return { cls: "timeout", text: "Queued — no agent available" };
    case "SafetyNet":
      return { cls: "notified", text: "Safety-net broadcast open — awaiting first agent to accept" };
    default:
      return null;
  }
}

export function RoutingTimeline({ req }: { req: RoutingRequest }) {
  const final = finalNode(req);
  const realAttempts = req.routingHistory.filter((h) => h.npn !== "SAFETY_NET").length;
  return (
    <div className={`card timeline-card${req.safetyNet ? " safetynet" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <code className="req-id">{req.requestId.slice(-8)}</code>{" "}
          <span className={`status-badge status-${req.status}`}>{req.status}</span>
          {req.safetyNet && <span className="status-badge status-SafetyNet">Safety net</span>}
        </div>
        <span className="hint">
          {req.language} · {req.state} · ZIP {req.zip} · {realAttempts} direct attempt
          {realAttempts === 1 ? "" : "s"}
          {req.safetyNet ? " + safety-net broadcast" : ""}
        </span>
      </div>

      <ol className="timeline">
        <li className="timeline-step">
          <span className="tl-dot submitted" aria-hidden="true" />
          <div className="tl-body">
            <strong>Request submitted</strong>
            <span className="tl-time">{time(req.createdAt)}</span>
          </div>
        </li>

        {req.routingHistory.map((h, i) => {
          const isBroadcast = h.npn === "SAFETY_NET";
          return (
            <li className="timeline-step" key={`${h.npn}-${i}`}>
              <span className={`tl-dot ${isBroadcast ? "safetynet" : h.outcome}`} aria-hidden="true" />
              <div className="tl-body">
                {isBroadcast ? (
                  <>
                    <strong>Safety-net broadcast</strong>{" "}
                    <span className="hint">emailed all licensed agents in {req.state}</span>
                    <div>
                      <span className={`outcome outcome-${h.outcome === "notified" ? "notified" : h.outcome}`}>
                        {h.outcome === "notified"
                          ? "Awaiting first agent to accept"
                          : h.outcome === "accepted"
                            ? "Claimed by an agent"
                            : "No agent accepted — queued"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>Notified {h.agentName}</strong> <span className="hint">NPN {h.npn}</span>
                    <div>
                      <span className={`outcome outcome-${h.outcome}`}>{OUTCOME_LABEL[h.outcome]}</span>
                      {h.resolvedAt && (
                        <span className="hint"> · {secondsBetween(h.notifiedAt, h.resolvedAt)} to resolve</span>
                      )}
                    </div>
                  </>
                )}
                <span className="tl-time">{time(h.notifiedAt)}</span>
              </div>
            </li>
          );
        })}

        {final && (
          <li className="timeline-step">
            <span className={`tl-dot ${final.cls}`} aria-hidden="true" />
            <div className="tl-body">
              <strong>{final.text}</strong>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
