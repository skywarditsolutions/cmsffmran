import { config } from "./config";

export interface Session {
  role: "agent" | "admin";
  npn?: string;
  email: string;
  idToken?: string;
  refreshToken?: string;
  loginAt?: string;
}

const KEY = "ran.session";

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

// Attempts a real Cognito USER_PASSWORD_AUTH flow to demonstrate the
// Cognito integration. In local mode (no cognitoClientId), falls back to
// a header-based identity so the prototype always remains demoable.
export async function login(
  email: string,
  password: string,
  role: "agent" | "admin",
  npn?: string,
): Promise<Session> {
  let idToken: string | undefined;
  let refreshToken: string | undefined;
  let resolvedNpn = npn;
  let resolvedRole = role;

  if (config.cognitoClientId) {
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.__type?.replace("Exception", "") ?? "Authentication failed";
      throw new Error(`Incorrect username or password. (${msg})`);
    }
    const data = await res.json();
    idToken = data.AuthenticationResult?.IdToken;
    refreshToken = data.AuthenticationResult?.RefreshToken;
    const claims = idToken ? decodeJwt(idToken) : undefined;
    resolvedNpn = (claims?.["custom:npn"] as string) || npn;
    // Detect actual role from Cognito groups so admin credentials always
    // land on the admin dashboard, even if the login form said "agent".
    const groups = claims?.["cognito:groups"] as string[] | undefined;
    if (groups?.includes("admins")) resolvedRole = "admin";
    else if (groups?.includes("agents")) resolvedRole = "agent";
  }

  const session: Session = { role: resolvedRole, npn: resolvedNpn, email, idToken, refreshToken, loginAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

// Refreshes the Cognito ID token using the stored refresh token.
// Returns the updated session, or null if refresh failed.
//
// Concurrent callers share a single in-flight refresh so a burst of parallel
// 401s (e.g. dashboard polling firing at once when the token expires) does not
// trigger many simultaneous Cognito calls or race on the stored session.
let refreshInFlight: Promise<Session | null> | null = null;

export function refreshSession(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<Session | null> {
  const session = getSession();
  if (!session?.refreshToken || !config.cognitoClientId) return null;

  try {
    const res = await fetch(config.cognitoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
      },
      body: JSON.stringify({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: config.cognitoClientId,
        AuthParameters: { REFRESH_TOKEN: session.refreshToken },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const newIdToken = data.AuthenticationResult?.IdToken;
      if (newIdToken) {
        // Preserve any concurrent session updates; only replace the id token.
        const latest = getSession() ?? session;
        const updated: Session = { ...latest, idToken: newIdToken };
        saveSession(updated);
        return updated;
      }
    }
  } catch {
    /* refresh failed */
  }
  return null;
}

// True when the session's ID token is expired or will expire within `skew`
// seconds. Used to refresh proactively before a request rather than waiting
// for a 401. Returns false when expiry can't be determined so the reactive
// 401 path remains the backstop.
export function idTokenExpiringSoon(session: Session | null, skewSeconds = 120): boolean {
  const claims = session?.idToken ? decodeJwt(session.idToken) : undefined;
  const exp = typeof claims?.exp === "number" ? (claims.exp as number) : null;
  if (exp == null) return false;
  return exp <= Math.floor(Date.now() / 1000) + skewSeconds;
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
