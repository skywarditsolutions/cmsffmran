import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { ddb } from "./clients.js";
import { env, isLocal } from "./env.js";

// Real-time push abstraction.
// - Local: POST to the ws-bridge (scripts/ws-bridge.ts) which fans out to
//   connected WebSocket clients.
// - Real AWS: query the connections table for the channel, then call
//   ApiGatewayManagementApi @connections for each connection.
// Channels: a requestId, an agent npn, or "admin".
export async function pushToChannel(
  channel: string,
  type: string,
  payload: unknown,
): Promise<void> {
  if (!env.wsCallbackUrl) return;

  if (isLocal) {
    // Local ws-bridge mode.
    try {
      await fetch(`${env.wsCallbackUrl}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, message: { type, payload } }),
      });
    } catch (err) {
      console.warn("ws push failed", channel, type, String(err));
    }
    return;
  }

  // Real AWS: fan out via @connections API.
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: env.connectionsTable,
        IndexName: "byChannel",
        KeyConditionExpression: "channel = :ch",
        ExpressionAttributeValues: { ":ch": channel },
      }),
    );
    const connections = result.Items ?? [];
    if (connections.length === 0) return;

    const mgmtApi = new ApiGatewayManagementApiClient({
      endpoint: env.wsCallbackUrl,
      region: env.region,
    });

    const message = JSON.stringify({ type, payload });
    await Promise.allSettled(
      connections.map((conn) =>
        mgmtApi.send(
          new PostToConnectionCommand({
            ConnectionId: conn.connectionId as string,
            Data: message,
          }),
        ).catch(async (err) => {
          // Gone connections should be cleaned up.
          if (err?.name === "GoneException" || err?.$metadata?.httpStatusCode === 410) {
            const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
            await ddb.send(
              new DeleteCommand({
                TableName: env.connectionsTable,
                Key: { connectionId: conn.connectionId },
              }),
            ).catch(() => {});
          }
        }),
      ),
    );
  } catch (err) {
    console.warn("ws push failed", channel, type, String(err));
  }
}
