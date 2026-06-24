import { config } from "./config";

export interface Session {
  role: "agent" | "admin";
  npn?: string;
  email: string;
  idToken?: string;
  loginAt?: string;
}

const KEY = "ran.session";

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

// Attempts a real cognito-local USER_PASSWORD_AUTH flow to demonstrate the
// Cognito integration. Falls back to a header-based identity if the emulator
// is unavailable so the prototype always remains demoable.
export async function login(
  email: string,
  password: string,
  role: "agent" | "admin",
  npn?: string,
): Promise<Session> {
  let idToken: string | undefined;
  let resolvedNpn = npn;

  if (config.cognitoClientId) {
    try {
      const res = await fetch(config.cognitoUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
        },
        body: JSON.stringify({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: config.cognitoClientId,
          AuthParameters: { USERNAME: email, PASSWORD: password },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        idToken = data.AuthenticationResult?.IdToken;
        const claims = idToken ? decodeJwt(idToken) : undefined;
        resolvedNpn = (claims?.["custom:npn"] as string) || npn;
      }
    } catch {
      /* fall through to header-based identity */
    }
  }

  const session: Session = { role, npn: resolvedNpn, email, idToken, loginAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

function decodeJwt(token: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return undefined;
  }
}

export function authHeaders(session: Session | null): Record<string, string> {
  if (!session) return {};
  const headers: Record<string, string> = {
    "x-ran-role": session.role,
  };
  if (session.npn) headers["x-ran-npn"] = session.npn;
  if (session.idToken) headers.authorization = `Bearer ${session.idToken}`;
  return headers;
}
