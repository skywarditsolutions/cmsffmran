import { config } from "./config";
import { authHeaders, getSession, refreshSession, clearSession } from "./auth";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = false,
): Promise<T> {
  const doFetch = (): Promise<Response> =>
    fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? authHeaders(getSession()) : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  // If we get 401 and this is an authenticated request, try refreshing the
  // Cognito token once before giving up. If refresh fails, clear session and
  // redirect to login so the user gets a clear re-auth prompt instead of a
  // confusing "Unauthorized" error.
  if (res.status === 401 && auth) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await doFetch();
    } else {
      const role = getSession()?.role ?? "agent";
      clearSession();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?role=${role}&expired=1`;
      }
      throw new Error("Session expired. Please sign in again.");
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface RoutingAttempt {
  npn: string;
  agentName: string;
  notifiedAt: string;
  outcome: "notified" | "accepted" | "rejected" | "timeout";
  resolvedAt?: string;
  safetyNet?: boolean;
}

export interface RoutingRequest {
  number?: number;
  requestId: string;
  status: string;
  language: string;
  state: string;
  zip: string;
  city?: string;
  consumer?: string;
  consumerPhone?: string;
  safetyNet?: boolean;
  assignedNpn: string | null;
  createdAt: string;
  firstNotifiedAt?: string;
  acceptedAt?: string;
  completedAt?: string;
  routingHistory: RoutingAttempt[];
}

export interface CreateRequestInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  phoneType: "Mobile" | "Home" | "Work";
  preferredContactMethod: "Phone" | "Email";
  zip: string;
  language: string;
  consentTcpa: boolean;
}

export const api = {
  createRequest: (input: CreateRequestInput) =>
    request<{ requestId: string; status: string }>("POST", "/requests", input),
  getRequest: (id: string) =>
    request<{
      requestId: string;
      status: string;
      attempts: number;
      assignedAgent?: { name: string; phone: string };
    }>("GET", `/requests/${id}`),

  acceptReferral: (id: string) =>
    request<{
      consumer: { firstName: string; lastName: string; phone: string; email?: string; phoneType?: string; preferredContactMethod?: string };
      zip: string;
      city?: string;
      language: string;
      safetyNet?: boolean;
    }>("POST", `/agent/requests/${id}/accept`, undefined, true),
  rejectReferral: (id: string) =>
    request("POST", `/agent/requests/${id}/reject`, undefined, true),
  updateReferralStatus: (id: string, status: string) =>
    request("POST", `/agent/requests/${id}/status`, { status }, true),
  getProfile: () => request<any>("GET", "/agent/profile", undefined, true),
  updateProfile: (body: unknown) => request<any>("PUT", "/agent/profile", body, true),
  setOnline: (status: "online" | "offline") =>
    request("POST", "/agent/status", { status }, true),
  setTodayAvailability: (body: { accepting: boolean; stopReferralsAt: string | null }) =>
    request("POST", "/agent/today-availability", body, true),
  setOutOfOffice: (from: string | null, until: string | null) =>
    request("POST", "/agent/out-of-office", { from, until }, true),
  missedReferrals: () =>
    request<{ missed: { requestId: string; state: string; language: string; notifiedAt: string; resolvedAt?: string }[]; missedReferralCount: number }>(
      "GET",
      "/agent/missed-referrals",
      undefined,
      true,
    ),
  agentStats: () =>
    request<{
      acceptedToday: number;
      totalAccepted: number;
      avgResponseSeconds: number;
      activeLoad: number;
      maxLoad: number;
      missedReferralCount: number;
      online: boolean;
    }>("GET", "/agent/stats", undefined, true),
  agentHistory: () =>
    request<{
      history: {
        requestId: string;
        state: string;
        language: string;
        zip: string;
        outcome: string;
        notifiedAt: string;
        resolvedAt?: string;
        safetyNet: boolean;
        requestStatus: string;
      }[];
    }>("GET", "/agent/history", undefined, true),
  dismissMessage: (msgId: string) =>
    request<{ dismissed: boolean }>("DELETE", `/agent/messages/${msgId}`, undefined, true),

  metrics: () => request<any>("GET", "/admin/metrics", undefined, true),
  requests: () => request<{ requests: RoutingRequest[] }>("GET", "/admin/requests", undefined, true),
  getConfig: () => request<any>("GET", "/admin/config", undefined, true),
  updateConfig: (body: unknown) => request<any>("PUT", "/admin/config", body, true),
  getAgent: (npn: string) => request<any>("GET", `/admin/agent/${npn}`, undefined, true),
  notifyAgent: (npn: string, channel: "sms" | "email" | "push", message: string) =>
    request<any>("POST", `/admin/agent/${npn}/notify`, { channel, message }, true),
};
