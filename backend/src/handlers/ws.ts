import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb } from "../lib/clients.js";
import { env } from "../lib/env.js";

// These handlers back the API Gateway WebSocket route integrations in real AWS.
// Locally the ws-bridge (scripts/ws-bridge.ts) emulates the WebSocket API and
// manages subscriptions in-memory, so these run only on the deployed AWS path.
interface WsEvent {
  requestContext: { connectionId: string; routeKey: string };
  queryStringParameters?: Record<string, string>;
  body?: string;
}

export const wsConnect = async (event: WsEvent): Promise<APIGatewayProxyResultV2> => {
  const channel = event.queryStringParameters?.channel ?? "admin";
  await ddb.send(
    new PutCommand({
      TableName: env.connectionsTable,
      Item: {
        connectionId: event.requestContext.connectionId,
        channel,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    }),
  );
  return { statusCode: 200, body: "connected" };
};

export const wsDisconnect = async (event: WsEvent): Promise<APIGatewayProxyResultV2> => {
  await ddb.send(
    new DeleteCommand({
      TableName: env.connectionsTable,
      Key: { connectionId: event.requestContext.connectionId },
    }),
  );
  return { statusCode: 200, body: "disconnected" };
};

export const wsDefault = async (): Promise<APIGatewayProxyResultV2> => {
  return { statusCode: 200, body: "ok" };
};
