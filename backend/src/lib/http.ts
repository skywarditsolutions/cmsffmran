import type { APIGatewayProxyResultV2 } from "aws-lambda";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Content-Type": "application/json",
};

export function ok(body: unknown, statusCode = 200): APIGatewayProxyResultV2 {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

export function bad(message: string, statusCode = 400): APIGatewayProxyResultV2 {
  return { statusCode, headers: CORS, body: JSON.stringify({ error: message }) };
}

export function parseBody<T>(raw: string | undefined | null): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}
