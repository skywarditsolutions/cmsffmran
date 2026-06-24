process.env.AWS_ENDPOINT_OVERRIDE ??= "http://localhost:4566";
process.env.AWS_REGION ??= "us-east-1";

type AgentBroker = import("../src/lib/types.js").AgentBroker;
type NotificationChannel = import("../src/lib/types.js").NotificationChannel;

const LANGUAGES = ["English", "Spanish", "Vietnamese", "Chinese", "Tagalog", "Korean", "Creole"];
const FIRST = ["Maria", "James", "Linh", "Wei", "Aisha", "Carlos", "Sofia", "David", "Grace", "Omar", "Elena", "Marcus"];
const LAST = ["Garcia", "Smith", "Nguyen", "Chen", "Johnson", "Rodriguez", "Patel", "Kim", "Williams", "Lopez", "Brown", "Davis"];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function randomLanguages(i: number): string[] {
  const langs = new Set<string>(["English"]);
  langs.add(pick(LANGUAGES, i + 1));
  if (i % 3 === 0) langs.add(pick(LANGUAGES, i + 2));
  return [...langs];
}

function fullWeekAvailability() {
  // Available every day 08:00-20:00 for an easy demo.
  return Array.from({ length: 7 }, (_, day) => ({ day, start: "08:00", end: "20:00" }));
}

async function main() {
  const { putAgent } = await import("../src/lib/repo.js");
  const { putConfig } = await import("../src/lib/config.js");
  const { ZIP_INFO } = await import("../src/lib/zip.js");
  const { env } = await import("../src/lib/env.js");

  const states = [...new Set(Object.values(ZIP_INFO).map((z) => z.state))];
  console.log(`Seeding agents across ${states.length} states...`);

  let count = 0;
  const entries = Object.entries(ZIP_INFO);

  for (let i = 0; i < entries.length; i++) {
    const [, info] = entries[i];
    const perPrefix = 3;
    for (let j = 0; j < perPrefix; j++) {
      const idx = count;
      const npn = String(70000000 + idx);
      const licensed = [info.state];
      if (idx % 4 === 0) {
        const other = pick(states, idx + 1);
        if (other !== info.state) licensed.push(other);
      }
      const prefs: NotificationChannel[] = ["push"];
      if (idx % 2 === 0) prefs.push("sms");
      if (idx % 3 === 0) prefs.push("email");

      const agent: AgentBroker = {
        npn,
        name: `${pick(FIRST, idx)} ${pick(LAST, idx + 3)}`,
        email: `agent${npn}@example.com`,
        phone: `+1555${String(1000000 + idx).slice(-7)}`,
        licensedStates: licensed,
        activeStates: licensed,
        languages: randomLanguages(idx),
        notificationPrefs: prefs,
        availability: fullWeekAvailability(),
        todayAvailability: null,
        outOfOfficeUntil: null,
        outOfOfficeFrom: null,
        // A few agents with lapsed training / stale passwords / prior misses to
        // populate the admin compliance panel.
        trainingCurrent: idx % 11 !== 0,
        passwordUpdatedAt: new Date(Date.now() - (idx % 7 === 0 ? 200 : 30) * 86400000).toISOString(),
        status: "online",
        currentLoad: 0,
        maxLoad: 3 + (idx % 3),
        missedReferralCount: idx % 9 === 0 ? 6 : 0,
        lastAssignedAt: null,
        lat: info.lat + (Math.random() - 0.5) * 0.3,
        lng: info.lng + (Math.random() - 0.5) * 0.3,
      };
      await putAgent(agent);
      count++;
    }
  }

  await putConfig({
    routingTimeoutSeconds: env.routingTimeoutSeconds,
    maxRoutingAttempts: env.maxRoutingAttempts,
    proximityWeight: 0.3,
    safetyNetTimeoutSeconds: env.safetyNetTimeoutSeconds,
    missedReferralDeactivationThreshold: 5,
    passwordRotationDays: 180,
  });

  console.log(`Seeded ${count} agents and default runtime config.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
