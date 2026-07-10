import {
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { sfn } from "../lib/clients.js";
import { ok, bad, parseBody } from "../lib/http.js";
import { getIdentity } from "../lib/auth.js";
import { decryptPII } from "../lib/crypto.js";
import {
  getRequest,
  patchRequest,
  getAgent,
  putAgent,
  adjustAgentLoad,
  claimSafetyNetRequest,
  listAllRequests,
} from "../lib/repo.js";
import { pushToChannel } from "../lib/ws.js";
import type { RequestStatus, RoutingAttempt, TodayAvailability } from "../lib/types.js";

function requireAgent(event: APIGatewayProxyEventV2): string | undefined {
  const id = getIdentity(event);
  return id.role === "agent" || id.role === "admin" ? id.npn : undefined;
}

function resolveAttempt(
  history: RoutingAttempt[],
  npn: string,
  outcome: RoutingAttempt["outcome"],
): RoutingAttempt[] {
  const copy = history.map((h) => ({ ...h }));
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].npn === npn && copy[i].outcome === "notified") {
      copy[i].outcome = outcome;
      copy[i].resolvedAt = new Date().toISOString();
      break;
    }
  }
  return copy;
}

export const agentAccept = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const requestId = event.pathParameters?.id;
  if (!requestId) return bad("Missing request id");

  const req = await getRequest(requestId);
  if (!req) return bad("Request not found", 404);

  // Safety-net path: any licensed, participating agent in the consumer's state
  // may accept; first-come-first-serve via a conditional claim.
  if (req.safetyNet && req.status === "SafetyNet") {
    const agent = await getAgent(npn);
    if (!agent || !agent.activeStates.includes(req.state) || !agent.trainingCurrent) {
      return bad("Not eligible to accept this safety-net referral", 403);
    }
    // Limit to one active case at a time.
    const allReqs = await listAllRequests();
    const hasActive = allReqs.some(
      (r) => r.assignedNpn === npn && (r.status === "Accepted" || r.status === "InProgress"),
    );
    if (hasActive) {
      return bad("You already have an active referral. Complete or close it before accepting another.", 409);
    }
    const won = await claimSafetyNetRequest(requestId, npn, "SafetyNet");
    if (!won) {
      return bad("Another agent accepted this referral first", 409);
    }
    const nowIso = new Date().toISOString();
    await adjustAgentLoad(npn, 1, true);
    const history = [
      ...req.routingHistory,
      { npn, notifiedAt: req.routingHistory[req.routingHistory.length - 1]?.notifiedAt ?? nowIso, outcome: "accepted" as const, resolvedAt: nowIso, safetyNet: true },
    ];
    await patchRequest(requestId, { acceptedAt: nowIso, routingHistory: history });

    if (req.taskToken) {
      await sfn
        .send(
          new SendTaskSuccessCommand({
            taskToken: req.taskToken,
            output: JSON.stringify({ accepted: true, npn }),
          }),
        )
        .catch((e) => console.warn("task success failed", String(e)));
    }

    const pii = await decryptPII(req.piiEncrypted);
    await pushToChannel(requestId, "status", { status: "Accepted" });
    await pushToChannel("admin", "requestUpdated", { requestId, status: "Accepted", npn, safetyNet: true });
    // Notify other agents the referral is gone.
    await pushToChannel("admin", "safetyNetClosed", { requestId, acceptedBy: npn });
    return ok({ requestId, status: "Accepted", consumer: pii, zip: req.zip, city: req.city, language: req.language, safetyNet: true });
  }

  // Standard routing path: only the assigned agent may accept.
  if (req.assignedNpn !== npn || req.status !== "Notified") {
    return bad("Referral is no longer available", 409);
  }

  // Limit to one active case at a time: check if the agent already has an
  // Accepted or InProgress referral.
  const allRequests = await listAllRequests();
  const hasActive = allRequests.some(
    (r) => r.assignedNpn === npn && (r.status === "Accepted" || r.status === "InProgress"),
  );
  if (hasActive) {
    return bad("You already have an active referral. Complete or close it before accepting another.", 409);
  }

  const acceptedAt = new Date().toISOString();
  const history = resolveAttempt(req.routingHistory, npn, "accepted");
  await patchRequest(requestId, {
    status: "Accepted",
    acceptedAt,
    routingHistory: history,
  });

  if (req.taskToken) {
    await sfn
      .send(
        new SendTaskSuccessCommand({
          taskToken: req.taskToken,
          output: JSON.stringify({ accepted: true, npn }),
        }),
      )
      .catch((e) => console.warn("task success failed", String(e)));
  }

  const pii = await decryptPII(req.piiEncrypted);

  await pushToChannel(requestId, "status", { status: "Accepted" });
  await pushToChannel("admin", "requestUpdated", { requestId, status: "Accepted", npn });

  // PII is revealed ONLY to the accepting agent, in the response.
  return ok({ requestId, status: "Accepted", consumer: pii, zip: req.zip, city: req.city, language: req.language });
};

export const agentReject = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const requestId = event.pathParameters?.id;
  if (!requestId) return bad("Missing request id");

  const req = await getRequest(requestId);
  if (!req) return bad("Request not found", 404);
  if (req.assignedNpn !== npn || req.status !== "Notified") {
    return bad("Referral is no longer available", 409);
  }

  const history = resolveAttempt(req.routingHistory, npn, "rejected");
  await patchRequest(requestId, { status: "Matching", routingHistory: history });
  await adjustAgentLoad(npn, -1, false);

  if (req.taskToken) {
    await sfn
      .send(
        new SendTaskFailureCommand({
          taskToken: req.taskToken,
          error: "ReferralRejected",
          cause: `Agent ${npn} rejected`,
        }),
      )
      .catch((e) => console.warn("task failure failed", String(e)));
  }

  await pushToChannel("admin", "requestUpdated", { requestId, status: "Matching", rejectedBy: npn });
  return ok({ requestId, status: "rejected" });
};

export const agentUpdateStatus = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const requestId = event.pathParameters?.id;
  if (!requestId) return bad("Missing request id");
  const body = parseBody<{ status: RequestStatus }>(event.body);

  const allowed: RequestStatus[] = ["InProgress", "Completed", "NotGoodReferral"];
  if (!allowed.includes(body.status)) return bad("Invalid status");

  const req = await getRequest(requestId);
  if (!req) return bad("Request not found", 404);
  if (req.assignedNpn !== npn) return bad("Not your referral", 403);

  const terminal = body.status === "Completed" || body.status === "NotGoodReferral";
  await patchRequest(requestId, {
    status: body.status,
    ...(terminal ? { completedAt: new Date().toISOString() } : {}),
  });
  if (terminal) await adjustAgentLoad(npn, -1, false);

  await pushToChannel(requestId, "status", { status: body.status });
  await pushToChannel("admin", "requestUpdated", { requestId, status: body.status, npn });
  return ok({ requestId, status: body.status });
};

export const agentProfileGet = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  return ok(agent);
};

interface ProfileUpdateBody {
  activeStates?: string[];
  languages?: string[];
  notificationPrefs?: ("sms" | "email" | "push")[];
  availability?: { day: number; start: string; end: string }[];
}

export const agentProfileUpdate = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  const body = parseBody<ProfileUpdateBody>(event.body);

  // Agents may only deselect from CMS-licensed states; never add new ones.
  if (body.activeStates) {
    const invalid = body.activeStates.filter((s) => !agent.licensedStates.includes(s));
    if (invalid.length > 0) {
      return bad(`States not permitted by CMS licensure: ${invalid.join(", ")}`);
    }
    agent.activeStates = body.activeStates;
  }
  // Languages are sourced from the MLMS profile and are NOT editable in-app.
  if (body.languages) {
    return bad(
      "Languages are managed in your MLMS profile at portal.cms.gov and cannot be edited here.",
    );
  }
  if (body.notificationPrefs) agent.notificationPrefs = body.notificationPrefs;
  if (body.availability) agent.availability = body.availability;

  await putAgent(agent);
  return ok(agent);
};

export const agentSetStatus = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const body = parseBody<{ status: "online" | "offline" }>(event.body);
  if (body.status !== "online" && body.status !== "offline") {
    return bad("Invalid status");
  }
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  agent.status = body.status;
  await putAgent(agent);
  await pushToChannel("admin", "agentStatus", { npn, status: body.status });
  return ok({ npn, status: body.status });
};

// "Today's Availability" temporary override: accept referrals outside standard
// hours until the stop timestamp.
export const agentTodayAvailability = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const body = parseBody<TodayAvailability>(event.body);
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  agent.todayAvailability = body.accepting ? body : null;
  await putAgent(agent);
  return ok({ npn, todayAvailability: agent.todayAvailability });
};

// "Out of Office" extended/indefinite absence with optional start date.
export const agentOutOfOffice = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const body = parseBody<{ from: string | null; until: string | null }>(event.body);
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  agent.outOfOfficeFrom = body.from ?? null;
  agent.outOfOfficeUntil = body.until ?? null;
  await putAgent(agent);
  return ok({ npn, outOfOfficeFrom: agent.outOfOfficeFrom, outOfOfficeUntil: agent.outOfOfficeUntil });
};

// Referrals this agent missed (timed out without an accept/reject), shown as a
// notice on next login. Per HOD, consistent misses risk deactivation.
export const agentMissedReferrals = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const all = await listAllRequests();
  const missed = all
    .flatMap((r) =>
      r.routingHistory
        .filter((h) => h.npn === npn && h.outcome === "timeout" && !h.safetyNet)
        .map((h) => ({
          requestId: r.requestId,
          state: r.state,
          language: r.language,
          notifiedAt: h.notifiedAt,
          resolvedAt: h.resolvedAt,
        })),
    )
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
    .slice(0, 10);
  const agent = await getAgent(npn);
  return ok({ missed, missedReferralCount: agent?.missedReferralCount ?? 0 });
};

// Performance summary for the agent dashboard: accepted today, avg response
// time, active load, total accepted, missed count.
export const agentStats = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);

  const all = await listAllRequests();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let acceptedToday = 0;
  let totalAccepted = 0;
  let responseTimes: number[] = [];

  for (const r of all) {
    for (const h of r.routingHistory) {
      if (h.npn === npn && h.outcome === "accepted" && h.resolvedAt && h.notifiedAt) {
        totalAccepted++;
        const respMs = Date.parse(h.resolvedAt) - Date.parse(h.notifiedAt);
        if (respMs > 0) responseTimes.push(respMs / 1000);
        if (Date.parse(h.resolvedAt) >= startOfToday.getTime()) {
          acceptedToday++;
        }
      }
    }
  }

  const avgResponseSeconds =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  return ok({
    acceptedToday,
    totalAccepted,
    avgResponseSeconds,
    activeLoad: agent.currentLoad,
    maxLoad: agent.maxLoad,
    missedReferralCount: agent.missedReferralCount,
    online: agent.status === "online",
  });
};

// Full history of prior matches for this agent (accepted, missed, rejected).
export const agentHistory = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const all = await listAllRequests();
  const history = all
    .flatMap((r) =>
      r.routingHistory
        .filter((h) => h.npn === npn)
        .map((h) => ({
          requestId: r.requestId,
          state: r.state,
          language: r.language,
          zip: r.zip,
          outcome: h.outcome,
          notifiedAt: h.notifiedAt,
          resolvedAt: h.resolvedAt,
          safetyNet: h.safetyNet ?? false,
          requestStatus: r.status,
        })),
    )
    .sort((a, b) => (b.resolvedAt ?? b.notifiedAt).localeCompare(a.resolvedAt ?? a.notifiedAt));
  return ok({ history });
};

// Dismiss (remove) a single admin message from the agent's record.
export const agentDismissMessage = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const npn = requireAgent(event);
  if (!npn) return bad("Unauthorized", 401);
  const msgId = event.pathParameters?.msgId;
  if (!msgId) return bad("Missing message ID");
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  const filtered = (agent.adminMessages ?? []).filter((m) => m.id !== msgId);
  await putAgent({ ...agent, adminMessages: filtered });
  return ok({ dismissed: true });
};
