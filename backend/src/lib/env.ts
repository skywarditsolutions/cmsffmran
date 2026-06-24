export const env = {
  agentsTable: process.env.AGENTS_TABLE ?? "ran-agents",
  requestsTable: process.env.REQUESTS_TABLE ?? "ran-requests",
  connectionsTable: process.env.CONNECTIONS_TABLE ?? "ran-connections",
  configTable: process.env.CONFIG_TABLE ?? "ran-config",
  piiKeyId: process.env.PII_KEY_ID ?? "alias/ran-pii",
  notificationsTopic: process.env.NOTIFICATIONS_TOPIC ?? "",
  sesSender: process.env.SES_SENDER ?? "no-reply@ran.cms.gov.example",
  stateMachineArn: process.env.STATE_MACHINE_ARN ?? "",
  routingTimeoutSeconds: Number(process.env.ROUTING_TIMEOUT_SECONDS ?? "30"),
  maxRoutingAttempts: Number(process.env.MAX_ROUTING_ATTEMPTS ?? "5"),
  safetyNetTimeoutSeconds: Number(process.env.SAFETY_NET_TIMEOUT_SECONDS ?? "120"),
  wsCallbackUrl: process.env.WS_CALLBACK_URL ?? "",
  region: process.env.AWS_REGION ?? "us-east-1",
  // Local (LocalStack) endpoint override. Empty string => real AWS.
  endpoint:
    process.env.AWS_ENDPOINT_OVERRIDE ??
    process.env.AWS_ENDPOINT_URL ??
    "",
};

export const isLocal = env.endpoint !== "";
