import { useState } from "react";
import { api } from "../lib/api";
import { LANGUAGES } from "../lib/config";
import { useChannel } from "../lib/useChannel";

type Phase = "form" | "searching" | "connected" | "completed" | "queued";

const STATUS_COPY: Record<string, string> = {
  Matching: "Finding an available agent or broker near you...",
  Notified: "We found an agent and are waiting for them to accept...",
  Accepted: "An agent has accepted and will call you shortly.",
  InProgress: "Your agent is assisting you.",
  Completed: "Your enrollment assistance is complete.",
  Queued: "All agents are busy. You are in line and will be contacted soon.",
  SafetyNet: "No agents are on duty right now. We've notified licensed agents in your state; the first to respond will call you.",
};

export function Consumer() {
  const [phase, setPhase] = useState<Phase>("form");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [agent, setAgent] = useState<{ name: string; phone: string } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [contactMethod, setContactMethod] = useState<"Phone" | "Email">("Phone");

  useChannel(requestId ? [requestId] : [], async (msg) => {
    if (msg.type !== "status") return;
    const status = msg.payload.status as string;
    setStatusText(STATUS_COPY[status] ?? status);
    if (status === "Queued") setPhase("queued");
    if (status === "SafetyNet") setPhase("searching");
    if (status === "Accepted" || status === "InProgress") {
      setPhase("connected");
      if (requestId) {
        const r = await api.getRequest(requestId);
        if (r.assignedAgent) setAgent(r.assignedAgent);
      }
    }
    if (status === "Completed") {
      setPhase("completed");
    }
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    if (!form.get("consentTcpa")) {
      setError("You must agree to the consent notice to request a callback.");
      return;
    }
    const email = String(form.get("email") || "");
    if (contactMethod === "Email" && !email) {
      setError("Email is required when Email is your preferred contact method.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createRequest({
        firstName: String(form.get("firstName")),
        lastName: String(form.get("lastName")),
        phone: String(form.get("phone")),
        email: email || undefined,
        phoneType: (String(form.get("phoneType")) as "Mobile" | "Home" | "Work") || "Mobile",
        preferredContactMethod: contactMethod,
        zip: String(form.get("zip")),
        language: String(form.get("language")),
        consentTcpa: true,
      });
      setRequestId(res.requestId);
      setStatusText(STATUS_COPY.Matching);
      setPhase("searching");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (phase !== "form") {
    return (
      <div className="container narrow">
        <div className="card" aria-live="polite">
          <h1>Your request for help</h1>
          {(phase === "searching" || phase === "queued") && (
            <p>
              <span className="spinner" aria-hidden="true" /> {statusText}
            </p>
          )}
          {phase === "connected" && (
            <div className="alert success" role="status">
              <strong>You're connected!</strong> {statusText}
              {agent && (
                <p>
                  <strong>{agent.name}</strong> will call you from{" "}
                  <strong>{agent.phone}</strong>. Please keep your phone nearby.
                </p>
              )}
            </div>
          )}
          {phase === "completed" && (
            <div className="alert success" role="status">
              <strong>Your enrollment assistance is complete.</strong>
              {agent && (
                <p>
                  Your agent <strong>{agent.name}</strong> has finished assisting you. If you need
                  further help, you can submit a new request at any time.
                </p>
              )}
            </div>
          )}
          <p className="hint">Reference ID: {requestId}</p>
          <p className="hint">
            You can keep browsing HealthCare.gov. We'll connect you without losing your place.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container narrow">
      <h1>Get free help enrolling in coverage</h1>
      <p>
        Request a callback from a licensed, Marketplace-registered agent or broker. Most
        consumers are contacted in under 15 minutes. This service is free.
      </p>

      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}

        <div className="card">
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" type="text" autoComplete="given-name" required />

          <label htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" type="text" autoComplete="family-name" required />

          <label htmlFor="phone">
            Phone number <span className="hint">(where the agent should call you)</span>
          </label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" required />

          <label htmlFor="phoneType">Phone type</label>
          <select id="phoneType" name="phoneType" defaultValue="Mobile">
            <option value="Mobile">Mobile</option>
            <option value="Home">Home</option>
            <option value="Work">Work</option>
          </select>

          <label htmlFor="preferredContactMethod">Preferred contact method</label>
          <select
            id="preferredContactMethod"
            name="preferredContactMethod"
            value={contactMethod}
            onChange={(e) => setContactMethod(e.target.value as "Phone" | "Email")}
          >
            <option value="Phone">Phone</option>
            <option value="Email">Email</option>
          </select>

          <label htmlFor="email">
            Email{" "}
            <span className="hint">
              {contactMethod === "Email" ? "(required)" : "(optional)"}
            </span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required={contactMethod === "Email"}
            aria-required={contactMethod === "Email"}
          />

          <label htmlFor="zip">ZIP code</label>
          <input
            id="zip"
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            autoComplete="postal-code"
            aria-describedby="zip-hint"
            required
          />
          <span id="zip-hint" className="hint">
            Used to match you with an agent licensed in your state.
          </span>

          <label htmlFor="language">Preferred language</label>
          <select id="language" name="language" defaultValue="English" required>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="disclaimer">
          <p>
            <strong>Before you continue.</strong> By submitting this form you will be connected
            with a third party (an independent, FFM-registered agent or broker) who is not part of
            HealthCare.gov. Your information will be used only to connect you with that agent or
            broker for enrollment assistance.
          </p>
          <p>
            Referrals through this service do not constitute an endorsement by CMS, the Department
            of Health &amp; Human Services, or the U.S. Government of any individual agent or
            broker.
          </p>
        </div>

        <fieldset>
          <legend>Consent</legend>
          <div className="checkbox-row">
            <input id="consentTcpa" name="consentTcpa" type="checkbox" />
            <label htmlFor="consentTcpa">
              I agree to be contacted by phone, including by text or autodialed call, at the number
              I provided, by a Marketplace-registered agent or broker. I understand consent is not a
              condition of enrollment (Telephone Consumer Protection Act).
            </label>
          </div>
        </fieldset>

        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Request a callback"}
        </button>
      </form>
    </div>
  );
}
