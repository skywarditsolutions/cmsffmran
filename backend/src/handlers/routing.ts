import { PublishCommand } from "@aws-sdk/client-sns";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { sns, ses } from "../lib/clients.js";
import { env } from "../lib/env.js";
import { getConfig } from "../lib/config.js";
import {
  getRequest,
  patchRequest,
  listAgentsForState,
  listAllAgents,
  getAgent,
  adjustAgentLoad,
  incrementMissedReferral,
} from "../lib/repo.js";
import { pickNext, isSafetyNetEligible } from "../lib/matching.js";
import { pushToChannel } from "../lib/ws.js";
import type { RoutingAttempt } from "../lib/types.js";

interface MatchInput {
  requestId: string;
}

interface MatchOutput {
  matched: boolean;
  npn?: string;
  reason?: string;
  safetyNet?: boolean;
}

// Step Functions task: select the next best agent for a request, excluding any
// already tried. Cleans up the previous (timed-out) attempt, enforces the max
// attempt cap, and tentatively reserves load on the chosen agent.
export const sfnMatch = async (input: MatchInput): Promise<MatchOutput> => {
  const req = await getRequest(input.requestId);
  if (!req) return { matched: false, reason: "not-found" };
  if (["Accepted", "InProgress", "Completed", "NotGoodReferral"].includes(req.status)) {
    return { matched: false, reason: "already-resolved" };
  }

  const history = [...req.routingHistory];

  // The prior attempt is still "notified" if we got here via timeout; release it
  // and record a missed referral for that agent (feeds the deactivation rule).
  const last = history[history.length - 1];
  if (last && last.outcome === "notified") {
    last.outcome = "timeout";
    last.resolvedAt = new Date().toISOString();
    await adjustAgentLoad(last.npn, -1, false);
    if (!last.safetyNet) {
      await incrementMissedReferral(last.npn);
      await pushToChannel(last.npn, "referralMissed", { requestId: req.requestId });
    }
    await pushToChannel(last.npn, "referralExpired", { requestId: req.requestId });
  }

  const config = await getConfig();
  const excluded = history.map((h) => h.npn);

  if (history.length >= config.maxRoutingAttempts) {
    await patchRequest(req.requestId, { status: "Queued", routingHistory: history });
    await pushToChannel(req.requestId, "status", { status: "Queued" });
    await pushToChannel("admin", "requestUpdated", { requestId: req.requestId, status: "Queued" });
    return { matched: false, reason: "max-attempts" };
  }

  const agents = await listAgentsForState(req.state);
  const choice = pickNext(agents, req, excluded, new Date(), config.proximityWeight);

  if (!choice) {
    // No immediately-available agent: fall through to the after-hours Safety Net
    // broadcast (handled by the SafetyNet state in the state machine).
    await patchRequest(req.requestId, { status: "SafetyNet", routingHistory: history });
    await pushToChannel(req.requestId, "status", { status: "SafetyNet" });
    await pushToChannel("admin", "requestUpdated", { requestId: req.requestId, status: "SafetyNet" });
    return { matched: false, reason: "no-candidates", safetyNet: true };
  }

  const npn = choice.agent.npn;
  const attempt: RoutingAttempt = {
    npn,
    notifiedAt: new Date().toISOString(),
    outcome: "notified",
  };
  history.push(attempt);

  await adjustAgentLoad(npn, 1, true);
  await patchRequest(req.requestId, {
    status: "Notified",
    assignedNpn: npn,
    routingHistory: history,
    firstNotifiedAt: req.firstNotifiedAt ?? attempt.notifiedAt,
  });

  await pushToChannel(req.requestId, "status", { status: "Notified" });
  await pushToChannel("admin", "requestUpdated", { requestId: req.requestId, status: "Notified", npn });

  return { matched: true, npn };
};

interface NotifyInput {
  requestId: string;
  npn: string;
  taskToken: string;
}

// Step Functions waitForTaskToken task: persist the token (so accept/reject can
// resolve the execution) and dispatch multi-channel notifications to the agent.
export const sfnNotify = async (input: NotifyInput): Promise<void> => {
  await patchRequest(input.requestId, { taskToken: input.taskToken });

  const agent = await getAgent(input.npn);
  if (!agent) return;

  const req = await getRequest(input.requestId);
  const summary = `New RAN referral: ${req?.language} speaker in ${req?.state} (ZIP ${req?.zip}). Accept within ${env.routingTimeoutSeconds}s.`;

  const prefs = agent.notificationPrefs ?? [];

  if (prefs.includes("sms") && env.notificationsTopic) {
    await sns
      .send(new PublishCommand({ TopicArn: env.notificationsTopic, Message: summary }))
      .catch((e) => console.warn("sns failed", String(e)));
  }
  if (prefs.includes("email")) {
    await ses
      .send(
        new SendEmailCommand({
          Source: env.sesSender,
          Destination: { ToAddresses: [agent.email] },
          Message: {
            Subject: { Data: "New RAN consumer referral" },
            Body: { Text: { Data: summary } },
          },
        }),
      )
      .catch((e) => console.warn("ses failed", String(e)));
  }

  // Push (web/mobile app) is always delivered to the agent's live channel.
  await pushToChannel(input.npn, "referral", {
    requestId: input.requestId,
    state: req?.state,
    zip: req?.zip,
    language: req?.language,
    timeoutSeconds: env.routingTimeoutSeconds,
  });
};

interface SafetyNetInput {
  requestId: string;
  taskToken: string;
}

// After-Hours Consumer Safety Net: when no agent is immediately available,
// broadcast an EMAIL to every licensed, participating, training-current agent
// in the consumer's state (ignoring online status / standard hours). First
// agent to accept wins; others cannot access the consumer's PII. Per HOD
// policy this is email-only and carries no penalty for ignoring.
export const sfnSafetyNet = async (input: SafetyNetInput): Promise<void> => {
  await patchRequest(input.requestId, { taskToken: input.taskToken, safetyNet: true });

  const req = await getRequest(input.requestId);
  if (!req) return;

  const all = await listAllAgents();
  const now = new Date();
  const eligible = all.filter((a) => isSafetyNetEligible(a, req.state, now));

  const broadcast: RoutingAttempt = {
    npn: "SAFETY_NET",
    notifiedAt: now.toISOString(),
    outcome: "notified",
    safetyNet: true,
  };
  await patchRequest(input.requestId, {
    routingHistory: [...req.routingHistory, broadcast],
  });

  const subject = `RAN safety-net referral: ${req.language} consumer in ${req.state} (ZIP ${req.zip})`;
  const body =
    `A consumer requested assistance outside normal agent availability hours.\n\n` +
    `State: ${req.state} (ZIP ${req.zip})\nLanguage: ${req.language}\n\n` +
    `This is a first-come, first-served safety-net referral. Log in to RAN and ` +
    `accept to receive the consumer's contact details. If another agent accepts ` +
    `first, the referral will no longer be available. No penalty applies for not responding.`;

  for (const a of eligible) {
    // Email only (HOD policy). SES is best-effort; LocalStack records the send.
    await ses
      .send(
        new SendEmailCommand({
          Source: env.sesSender,
          Destination: { ToAddresses: [a.email] },
          Message: { Subject: { Data: subject }, Body: { Text: { Data: body } } },
        }),
      )
      .catch((e) => console.warn("ses safety-net failed", a.npn, String(e)));
    // Surface in the agent UI too (demo), clearly labeled as a safety-net referral.
    await pushToChannel(a.npn, "safetyNetReferral", {
      requestId: req.requestId,
      state: req.state,
      zip: req.zip,
      language: req.language,
      city: req.city,
    });
  }

  await pushToChannel("admin", "safetyNetBroadcast", {
    requestId: req.requestId,
    state: req.state,
    notifiedAgents: eligible.length,
  });
};

// Cleanup when the safety-net window expires with no acceptance: mark the
// request Queued and resolve the broadcast history entry.
export const sfnSafetyNetTimeout = async (input: {
  requestId: string;
}): Promise<void> => {
  const req = await getRequest(input.requestId);
  if (!req) return;
  if (req.status !== "SafetyNet") return; // someone accepted
  const history = req.routingHistory.map((h) =>
    h.npn === "SAFETY_NET" && h.outcome === "notified"
      ? { ...h, outcome: "timeout" as const, resolvedAt: new Date().toISOString() }
      : h,
  );
  await patchRequest(input.requestId, { status: "Queued", routingHistory: history });
  await pushToChannel(input.requestId, "status", { status: "Queued" });
  await pushToChannel("admin", "requestUpdated", { requestId: input.requestId, status: "Queued" });
};
