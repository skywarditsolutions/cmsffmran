import type { APIGatewayProxyEventV2 } from "aws-lambda";

export interface Identity {
  npn?: string;
  role: "agent" | "admin" | "anonymous";
  email?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

// Resolves caller identity. In real AWS the API Gateway Cognito JWT authorizer
// populates verified claims; locally we accept the (cognito-local) bearer token
// and decode its claims, or convenience headers for scripted demos.
export function getIdentity(event: APIGatewayProxyEventV2): Identity {
  const ctxClaims = (event.requestContext as any)?.authorizer?.jwt?.claims as
    | Record<string, unknown>
    | undefined;

  const headers = event.headers ?? {};
  const auth = headers.authorization ?? headers.Authorization;
  const tokenClaims = auth?.startsWith("Bearer ")
    ? decodeJwtPayload(auth.slice(7))
    : undefined;

  const claims = ctxClaims ?? tokenClaims;
  if (claims) {
    const groups = String(claims["cognito:groups"] ?? "");
    const role: Identity["role"] = groups.includes("admins")
      ? "admin"
      : groups.includes("agents")
        ? "agent"
        : "anonymous";
    return {
      npn: (claims["custom:npn"] as string) ?? undefined,
      email: (claims.email as string) ?? undefined,
      role,
    };
  }

  // Fallback convenience headers (local/demo only).
  const hdrNpn = headers["x-ran-npn"];
  const hdrRole = headers["x-ran-role"] as Identity["role"] | undefined;
  if (hdrNpn || hdrRole) {
    return { npn: hdrNpn, role: hdrRole ?? "agent" };
  }
  return { role: "anonymous" };
}
