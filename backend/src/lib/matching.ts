import type { AgentBroker, AssistanceRequest } from "./types.js";
import { distanceMiles } from "./zip.js";

export interface MatchContext {
  language: string;
  state: string;
  lat: number;
  lng: number;
  excludedNpns: string[];
  now: Date;
  proximityWeight: number;
}

export interface RankedAgent {
  agent: AgentBroker;
  distance: number;
  score: number;
}

function withinAvailability(agent: AgentBroker, now: Date): boolean {
  // Out of Office blocks all referrals until the return date.
  if (agent.outOfOfficeUntil && Date.parse(agent.outOfOfficeUntil) > now.getTime()) {
    return false;
  }
  // Today's Availability temporary override: accept referrals outside standard
  // hours until the stop timestamp.
  const today = agent.todayAvailability;
  if (today?.accepting && today.stopReferralsAt && Date.parse(today.stopReferralsAt) > now.getTime()) {
    return true;
  }
  if (!agent.availability || agent.availability.length === 0) return true;
  const day = now.getDay();
  const hhmm = now.toTimeString().slice(0, 5);
  return agent.availability.some(
    (w) => w.day === day && w.start <= hhmm && hhmm < w.end,
  );
}

export function isEligible(agent: AgentBroker, ctx: MatchContext): boolean {
  return (
    agent.status === "online" &&
    agent.trainingCurrent && // annual CMS training must be current
    !ctx.excludedNpns.includes(agent.npn) &&
    agent.activeStates.includes(ctx.state) &&
    agent.languages.includes(ctx.language) &&
    agent.currentLoad < agent.maxLoad &&
    withinAvailability(agent, ctx.now)
  );
}

// Safety-net eligibility: licensed+participating in the state, training current,
// not out of office. Ignores online status, standard hours, and load (the
// safety net is an after-hours broadcast to all such agents).
export function isSafetyNetEligible(agent: AgentBroker, state: string, now: Date): boolean {
  if (agent.outOfOfficeUntil && Date.parse(agent.outOfOfficeUntil) > now.getTime()) {
    return false;
  }
  return (
    agent.activeStates.includes(state) &&
    agent.trainingCurrent
  );
}

// Lower score is better. Load balancing is the dominant factor (so requests
// spread evenly across agents in a geography), then proximity, then fairness
// via least-recently-assigned.
export function rankCandidates(
  agents: AgentBroker[],
  ctx: MatchContext,
): RankedAgent[] {
  const eligible = agents.filter((a) => isEligible(a, ctx));
  const ranked = eligible.map((agent) => {
    const distance = distanceMiles(ctx.lat, ctx.lng, agent.lat, agent.lng);
    const loadFactor = agent.currentLoad / agent.maxLoad; // 0..1
    const proximityFactor = Math.min(distance / 500, 1); // normalize ~500mi
    const recencyFactor = agent.lastAssignedAt
      ? Math.max(0, 1 - (ctx.now.getTime() - Date.parse(agent.lastAssignedAt)) / 3_600_000)
      : 0; // recently assigned => higher (worse)
    const score =
      loadFactor * (1 - ctx.proximityWeight) +
      proximityFactor * ctx.proximityWeight +
      recencyFactor * 0.1;
    return { agent, distance, score };
  });
  ranked.sort((a, b) => a.score - b.score);
  return ranked;
}

export function pickNext(
  agents: AgentBroker[],
  request: Pick<AssistanceRequest, "language" | "state" | "lat" | "lng">,
  excludedNpns: string[],
  now: Date,
  proximityWeight: number,
): RankedAgent | undefined {
  const ranked = rankCandidates(agents, {
    language: request.language,
    state: request.state,
    lat: request.lat,
    lng: request.lng,
    excludedNpns,
    now,
    proximityWeight,
  });
  return ranked[0];
}
