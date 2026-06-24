import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./clients.js";
import { env } from "./env.js";

export interface RuntimeConfig {
  routingTimeoutSeconds: number;
  maxRoutingAttempts: number;
  proximityWeight: number; // 0..1 influence of distance on ranking
  safetyNetTimeoutSeconds: number; // how long a safety-net broadcast stays open
  missedReferralDeactivationThreshold: number; // timeouts before deactivation risk
  passwordRotationDays: number; // 180 per HOD policy
}

const KEY = "runtime";

const defaults: RuntimeConfig = {
  routingTimeoutSeconds: env.routingTimeoutSeconds,
  maxRoutingAttempts: env.maxRoutingAttempts,
  proximityWeight: 0.3,
  safetyNetTimeoutSeconds: env.safetyNetTimeoutSeconds,
  missedReferralDeactivationThreshold: 5,
  passwordRotationDays: 180,
};

export async function getConfig(): Promise<RuntimeConfig> {
  const res = await ddb.send(
    new GetCommand({ TableName: env.configTable, Key: { configKey: KEY } }),
  );
  return { ...defaults, ...(res.Item?.value as Partial<RuntimeConfig> | undefined) };
}

export async function putConfig(value: RuntimeConfig): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: env.configTable,
      Item: { configKey: KEY, value },
    }),
  );
}
