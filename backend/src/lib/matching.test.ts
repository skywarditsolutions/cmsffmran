import { describe, it, expect } from "vitest";
import { rankCandidates, isEligible, pickNext, isSafetyNetEligible } from "./matching.js";
import type { AgentBroker } from "./types.js";

function agent(overrides: Partial<AgentBroker>): AgentBroker {
  return {
    npn: "1",
    name: "Test",
    email: "t@example.com",
    phone: "+15550000000",
    licensedStates: ["FL"],
    activeStates: ["FL"],
    languages: ["English"],
    notificationPrefs: ["push"],
    availability: [],
    todayAvailability: null,
    outOfOfficeUntil: null,
    outOfOfficeFrom: null,
    trainingCurrent: true,
    passwordUpdatedAt: "changeme",
    status: "online",
    currentLoad: 0,
    maxLoad: 3,
    missedReferralCount: 0,
    lastAssignedAt: null,
    lat: 25.78,
    lng: -80.21,
    ...overrides,
  };
}

const ctx = {
  language: "English",
  state: "FL",
  lat: 25.78,
  lng: -80.21,
  excludedNpns: [] as string[],
  now: new Date("2025-01-06T15:00:00Z"),
  proximityWeight: 0.3,
};

describe("isEligible", () => {
  it("excludes offline agents", () => {
    expect(isEligible(agent({ status: "offline" }), ctx)).toBe(false);
  });

  it("excludes agents not licensed/active in the state", () => {
    expect(isEligible(agent({ activeStates: ["TX"] }), ctx)).toBe(false);
  });

  it("excludes agents without the language", () => {
    expect(isEligible(agent({ languages: ["Spanish"] }), ctx)).toBe(false);
  });

  it("excludes agents at max load", () => {
    expect(isEligible(agent({ currentLoad: 3, maxLoad: 3 }), ctx)).toBe(false);
  });

  it("excludes explicitly excluded npns", () => {
    expect(isEligible(agent({ npn: "9" }), { ...ctx, excludedNpns: ["9"] })).toBe(false);
  });

  it("excludes agents whose annual training is not current", () => {
    expect(isEligible(agent({ trainingCurrent: false }), ctx)).toBe(false);
  });

  it("excludes agents who are out of office", () => {
    expect(
      isEligible(agent({ outOfOfficeUntil: "2025-01-07T00:00:00Z" }), ctx),
    ).toBe(false);
  });

  it("respects availability windows", () => {
    const a = agent({ availability: [{ day: 1, start: "08:00", end: "20:00" }] });
    expect(isEligible(a, { ...ctx, now: new Date("2025-01-06T15:00:00") })).toBe(true);
    expect(isEligible(a, { ...ctx, now: new Date("2025-01-06T23:00:00") })).toBe(false);
  });

  it("Today's Availability override admits an agent outside standard hours", () => {
    const a = agent({
      availability: [{ day: 1, start: "08:00", end: "20:00" }],
      todayAvailability: { accepting: true, stopReferralsAt: "2025-01-06T23:59:00Z" },
    });
    expect(isEligible(a, { ...ctx, now: new Date("2025-01-06T23:00:00") })).toBe(true);
  });
});

describe("isSafetyNetEligible", () => {
  it("admits an offline agent licensed in the state with current training", () => {
    expect(isSafetyNetEligible(agent({ status: "offline" }), "FL", ctx.now)).toBe(true);
  });

  it("excludes agents not licensed in the state", () => {
    expect(isSafetyNetEligible(agent({ activeStates: ["TX"] }), "FL", ctx.now)).toBe(false);
  });

  it("excludes out-of-office agents", () => {
    expect(
      isSafetyNetEligible(agent({ outOfOfficeUntil: "2025-01-07T00:00:00Z" }), "FL", ctx.now),
    ).toBe(false);
  });

  it("excludes agents whose training is not current", () => {
    expect(isSafetyNetEligible(agent({ trainingCurrent: false }), "FL", ctx.now)).toBe(false);
  });
});

describe("rankCandidates", () => {
  it("load-balances toward the least-loaded agent", () => {
    const agents = [
      agent({ npn: "busy", currentLoad: 2, maxLoad: 3 }),
      agent({ npn: "free", currentLoad: 0, maxLoad: 3 }),
    ];
    const ranked = rankCandidates(agents, ctx);
    expect(ranked[0].agent.npn).toBe("free");
  });

  it("prefers closer agents when load is equal", () => {
    const agents = [
      agent({ npn: "far", lat: 47.6, lng: -122.3 }),
      agent({ npn: "near", lat: 25.78, lng: -80.21 }),
    ];
    const ranked = rankCandidates(agents, ctx);
    expect(ranked[0].agent.npn).toBe("near");
  });

  it("returns empty when nobody is eligible", () => {
    expect(rankCandidates([agent({ status: "offline" })], ctx)).toHaveLength(0);
  });
});

describe("pickNext", () => {
  it("skips excluded agents during reroute", () => {
    const agents = [
      agent({ npn: "first", currentLoad: 0 }),
      agent({ npn: "second", currentLoad: 1 }),
    ];
    const choice = pickNext(
      agents,
      { language: "English", state: "FL", lat: 25.78, lng: -80.21 },
      ["first"],
      ctx.now,
      0.3,
    );
    expect(choice?.agent.npn).toBe("second");
  });
});
