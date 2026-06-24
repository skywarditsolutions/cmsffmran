import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb } from "./clients.js";
import { env } from "./env.js";
import type { AgentBroker, AssistanceRequest } from "./types.js";

export async function getAgent(npn: string): Promise<AgentBroker | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: env.agentsTable, Key: { npn } }),
  );
  return res.Item as AgentBroker | undefined;
}

export async function putAgent(agent: AgentBroker): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.agentsTable, Item: agent }));
}

// Agents serve multiple states (activeStates[]), which a single-attribute GSI
// cannot model, so we scan and filter. At prototype scale this is fine; a
// production build would maintain a (state -> npn) index table or use OpenSearch.
export async function listAgentsForState(state: string): Promise<AgentBroker[]> {
  const all = await listAllAgents();
  return all.filter((a) => a.activeStates?.includes(state));
}

export async function listAllAgents(): Promise<AgentBroker[]> {
  const res = await ddb.send(new ScanCommand({ TableName: env.agentsTable }));
  return (res.Items ?? []) as AgentBroker[];
}

export async function adjustAgentLoad(
  npn: string,
  delta: number,
  markAssigned: boolean,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: env.agentsTable,
      Key: { npn },
      UpdateExpression: markAssigned
        ? "SET currentLoad = if_not_exists(currentLoad, :z) + :d, lastAssignedAt = :now"
        : "SET currentLoad = if_not_exists(currentLoad, :z) + :d",
      ExpressionAttributeValues: markAssigned
        ? { ":d": delta, ":z": 0, ":now": new Date().toISOString() }
        : { ":d": delta, ":z": 0 },
    }),
  );
}

// Increment an agent's missed-referral counter (timed-out referrals feed the
// HOD deactivation rule).
export async function incrementMissedReferral(npn: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: env.agentsTable,
      Key: { npn },
      UpdateExpression:
        "SET missedReferralCount = if_not_exists(missedReferralCount, :z) + :one",
      ExpressionAttributeValues: { ":z": 0, ":one": 1 },
    }),
  );
}

// First-come-first-serve atomic claim for a safety-net referral: only the
// first acceptor transitions the request from the open safety-net status to
// Accepted. Returns true if this caller won the race.
export async function claimSafetyNetRequest(
  requestId: string,
  npn: string,
  openStatus: string,
): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: env.requestsTable,
        Key: { requestId },
        UpdateExpression:
          "SET #s = :accepted, assignedNpn = :npn, acceptedAt = :now, #ua = :now",
        // The atomic status flip is the race guard: only the caller that sees
        // the request still in the open status wins.
        ConditionExpression: "#s = :open",
        ExpressionAttributeNames: { "#s": "status", "#ua": "updatedAt" },
        ExpressionAttributeValues: {
          ":open": openStatus,
          ":accepted": "Accepted",
          ":npn": npn,
          ":now": new Date().toISOString(),
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function getRequest(
  requestId: string,
): Promise<AssistanceRequest | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: env.requestsTable, Key: { requestId } }),
  );
  return res.Item as AssistanceRequest | undefined;
}

export async function putRequest(req: AssistanceRequest): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.requestsTable, Item: req }));
}

export async function patchRequest(
  requestId: string,
  attrs: Partial<AssistanceRequest>,
): Promise<void> {
  const keys = Object.keys(attrs);
  if (keys.length === 0) return;
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":updatedAt": new Date().toISOString() };
  const sets = keys.map((k, i) => {
    names[`#k${i}`] = k;
    values[`:v${i}`] = (attrs as Record<string, unknown>)[k];
    return `#k${i} = :v${i}`;
  });
  names["#updatedAt"] = "updatedAt";
  await ddb.send(
    new UpdateCommand({
      TableName: env.requestsTable,
      Key: { requestId },
      UpdateExpression: `SET ${sets.join(", ")}, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function listAllRequests(): Promise<AssistanceRequest[]> {
  const res = await ddb.send(new ScanCommand({ TableName: env.requestsTable }));
  return (res.Items ?? []) as AssistanceRequest[];
}
