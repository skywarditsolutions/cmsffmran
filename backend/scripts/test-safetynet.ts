process.env.AWS_ENDPOINT_OVERRIDE ??= "http://localhost:4566";
process.env.AWS_REGION ??= "us-east-1";

export {};

async function main() {
  const { listAllAgents, putAgent } = await import("../src/lib/repo.js");
  const all = await listAllAgents();
  for (const a of all) {
    a.status = "offline";
    await putAgent(a);
  }
  console.log(`Set ${all.length} agents offline to force the safety-net path.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
