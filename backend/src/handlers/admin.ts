import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ok, bad, parseBody } from "../lib/http.js";
import { getIdentity } from "../lib/auth.js";
import { getConfig, putConfig, type RuntimeConfig } from "../lib/config.js";
import { listAllRequests, listAllAgents, getAgent, putAgent } from "../lib/repo.js";
import { pushToChannel } from "../lib/ws.js";
import { sns, ses } from "../lib/clients.js";
import { PublishCommand } from "@aws-sdk/client-sns";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { env } from "../lib/env.js";
import { decryptPII } from "../lib/crypto.js";
import type { AdminMessage } from "../lib/types.js";

function requireAdmin(event: APIGatewayProxyEventV2): boolean {
  return getIdentity(event).role === "admin";
}

export const adminMetrics = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!requireAdmin(event)) return bad("Unauthorized", 401);

  const [requests, agents] = await Promise.all([listAllRequests(), listAllAgents()]);
  const config = await getConfig();

  const byStatus: Record<string, number> = {};
  let responseTotal = 0;
  let responseCount = 0;
  let acceptedCount = 0;
  let rerouteCount = 0;
  let notifiedCount = 0;
  let safetyNetCount = 0;

  for (const r of requests) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    notifiedCount += r.routingHistory.length;
    rerouteCount += Math.max(0, r.routingHistory.length - 1);
    if (r.safetyNet) safetyNetCount += 1;
    const accepted = r.routingHistory.find((h) => h.outcome === "accepted");
    if (accepted) {
      acceptedCount += 1;
      if (r.firstNotifiedAt && r.acceptedAt) {
        responseTotal += (Date.parse(r.acceptedAt) - Date.parse(r.firstNotifiedAt)) / 1000;
        responseCount += 1;
      }
    }
  }

  const activeAgents = agents.filter((a) => a.status === "online").length;
  const activeRequests = requests.filter((r) =>
    ["Matching", "Notified", "Accepted", "InProgress", "Queued", "SafetyNet"].includes(r.status),
  ).length;

  // Compliance flags per HOD deactivation/rotation policy.
  const now = Date.now();
  const passwordMs = config.passwordRotationDays * 24 * 60 * 60 * 1000;
  const compliance = agents
    .map((a) => ({
      npn: a.npn,
      name: a.name,
      email: a.email,
      flags: {
        missedReferrals: a.missedReferralCount,
        deactivationRisk:
          (a.missedReferralCount ?? 0) >= config.missedReferralDeactivationThreshold,
        passwordStale:
          !a.passwordUpdatedAt || now - Date.parse(a.passwordUpdatedAt) > passwordMs,
        trainingLapsed: !a.trainingCurrent,
      },
    }))
    .filter((a) =>
      a.flags.deactivationRisk || a.flags.passwordStale || a.flags.trainingLapsed,
    );

  return ok({
    totals: {
      requests: requests.length,
      activeRequests,
      agents: agents.length,
      activeAgents,
    },
    byStatus,
    avgResponseSeconds: responseCount ? Math.round(responseTotal / responseCount) : 0,
    acceptanceRate: notifiedCount ? Math.round((acceptedCount / notifiedCount) * 100) : 0,
    rerouteCount,
    safetyNetCount,
    // Concurrency caps from the SOO, for the demo capacity panel.
    capacity: { consumers: 25000, agents: 2500, admins: 5 },
    compliance: {
      thresholds: {
        missedReferralDeactivationThreshold: config.missedReferralDeactivationThreshold,
        passwordRotationDays: config.passwordRotationDays,
      },
      flaggedAgents: compliance,
    },
    agents: agents.map((a) => ({
      npn: a.npn,
      name: a.name,
      states: a.activeStates,
      languages: a.languages,
      status: a.status,
      currentLoad: a.currentLoad,
      maxLoad: a.maxLoad,
      missedReferralCount: a.missedReferralCount,
      trainingCurrent: a.trainingCurrent,
    })),
  });
};

// Per-request routing timeline (no PII): mirrors what a Step Functions
// execution history would show — each notify attempt, its outcome, and the
// final state — reconstructed from the request's routingHistory.
export const adminRequests = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!requireAdmin(event)) return bad("Unauthorized", 401);

  const [requests, agents] = await Promise.all([listAllRequests(), listAllAgents()]);
  const nameByNpn = Object.fromEntries(agents.map((a) => [a.npn, a.name]));

  const sorted = [...requests]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 25);

  // Decrypt PII so admin can see masked consumer contact information
  const withPii = await Promise.all(sorted.map(async (r) => {
    let consumer: { firstName?: string; lastName?: string; phone?: string } = {};
    try { const pii = await decryptPII(r.piiEncrypted); consumer = { firstName: pii.firstName, lastName: pii.lastName, phone: pii.phone }; } catch { /* KMS not available */ }
    return { r, consumer };
  }));

  return ok({
    requests: withPii.map(({ r, consumer }, idx) => ({
      number: idx + 1,
      requestId: r.requestId,
      status: r.status,
      language: r.language,
      state: r.state,
      zip: r.zip,
      city: r.city,
      // Mask PII: show first initial + last initial only, mask phone digits
      consumer: consumer.firstName ? `${consumer.firstName[0]}** ${consumer.lastName?.[0] ?? "*"}**` : "Unknown",
      consumerPhone: consumer.phone ? consumer.phone.replace(/\d(?=\d{2})/g, "*") : "",
      safetyNet: r.safetyNet,
      assignedNpn: r.assignedNpn,
      createdAt: r.createdAt,
      firstNotifiedAt: r.firstNotifiedAt,
      acceptedAt: r.acceptedAt,
      completedAt: r.completedAt,
      routingHistory: r.routingHistory.map((h) => ({
        npn: h.npn,
        agentName: nameByNpn[h.npn] ?? (h.npn === "SAFETY_NET" ? "Safety-net broadcast" : h.npn),
        notifiedAt: h.notifiedAt,
        outcome: h.outcome,
        resolvedAt: h.resolvedAt,
        safetyNet: h.safetyNet,
      })),
    })),
  });
};

export const adminConfigGet = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!requireAdmin(event)) return bad("Unauthorized", 401);
  return ok(await getConfig());
};

export const adminConfigUpdate = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!requireAdmin(event)) return bad("Unauthorized", 401);
  const current = await getConfig();
  const body = parseBody<Partial<RuntimeConfig>>(event.body);
  const next: RuntimeConfig = {
    routingTimeoutSeconds: body.routingTimeoutSeconds ?? current.routingTimeoutSeconds,
    maxRoutingAttempts: body.maxRoutingAttempts ?? current.maxRoutingAttempts,
    proximityWeight: body.proximityWeight ?? current.proximityWeight,
    safetyNetTimeoutSeconds: body.safetyNetTimeoutSeconds ?? current.safetyNetTimeoutSeconds,
    missedReferralDeactivationThreshold:
      body.missedReferralDeactivationThreshold ?? current.missedReferralDeactivationThreshold,
    passwordRotationDays: body.passwordRotationDays ?? current.passwordRotationDays,
  };
  await putConfig(next);
  return ok(next);
};

// Get a single agent's full profile by NPN (admin view).
export const adminGetAgent = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!requireAdmin(event)) return bad("Unauthorized", 401);
  const npn = event.pathParameters?.npn;
  if (!npn) return bad("Missing NPN");
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  return ok({
    npn: agent.npn,
    name: agent.name,
    email: agent.email,
    phone: agent.phone,
    licensedStates: agent.licensedStates,
    activeStates: agent.activeStates,
    languages: agent.languages,
    notificationPrefs: agent.notificationPrefs,
    availability: agent.availability,
    todayAvailability: agent.todayAvailability,
    outOfOfficeFrom: agent.outOfOfficeFrom,
    outOfOfficeUntil: agent.outOfOfficeUntil,
    trainingCurrent: agent.trainingCurrent,
    passwordUpdatedAt: agent.passwordUpdatedAt,
    status: agent.status,
    currentLoad: agent.currentLoad,
    maxLoad: agent.maxLoad,
    missedReferralCount: agent.missedReferralCount,
    lastAssignedAt: agent.lastAssignedAt,
    lat: agent.lat,
    lng: agent.lng,
  });
};

// Push a custom notification to a specific agent (SMS, email, or push).
export const adminNotifyAgent = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!requireAdmin(event)) return bad("Unauthorized", 401);
  const npn = event.pathParameters?.npn;
  if (!npn) return bad("Missing NPN");
  const agent = await getAgent(npn);
  if (!agent) return bad("Agent not found", 404);
  const body = parseBody<{ channel: "sms" | "email" | "push"; message: string }>(event.body);
  if (!body.message?.trim()) return bad("Message is required");
  if (!["sms", "email", "push"].includes(body.channel)) return bad("Invalid channel");

  const subject = "RAN admin notification";
  let delivered = false;

  if (body.channel === "sms") {
    try {
      await sns.send(new PublishCommand({
        TopicArn: env.notificationsTopic,
        Message: body.message,
        Subject: subject,
      }));
      delivered = true;
    } catch (e) { console.warn("SMS notify failed", String(e)); }
  } else if (body.channel === "email") {
    try {
      await ses.send(new SendEmailCommand({
        Source: env.sesSender,
        Destination: { ToAddresses: [agent.email] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body.message } },
        },
      }));
      delivered = true;
    } catch (e) { console.warn("Email notify failed", String(e)); }
  } else if (body.channel === "push") {
    try {
      await pushToChannel(npn, "adminNotification", { message: body.message, from: "CMS Admin" });
      delivered = true;
    } catch (e) { console.warn("Push notify failed", String(e)); }
  }

  if (!delivered) return bad("Failed to send notification (SES may be in sandbox mode)");

  // Persist the message in the agent's record so it's visible on next login
  const adminMsg: AdminMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: "CMS Admin",
    message: body.message,
    sentAt: new Date().toISOString(),
    channel: body.channel,
  };
  const existingMessages = agent.adminMessages ?? [];
  await putAgent({ ...agent, adminMessages: [...existingMessages, adminMsg] });

  return ok({ npn, channel: body.channel, sent: true });
};
