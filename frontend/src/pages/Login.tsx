import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../lib/auth";

const DEFAULTS = {
  agent: { email: "agent@ran.demo", password: "Agent#Demo123", npn: "70000000" },
  admin: { email: "admin@ran.demo", password: "Admin#Demo123", npn: "" },
};

export function Login() {
  const [params] = useSearchParams();
  const role = (params.get("role") as "agent" | "admin") ?? "agent";
  const expired = params.get("expired") === "1";
  const navigate = useNavigate();
  const defaults = DEFAULTS[role];

  const [email, setEmail] = useState(defaults.email);
  const [password, setPassword] = useState(defaults.password);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function doLogin(em: string, pw: string, npn: string) {
    setBusy(true);
    setError("");
    try {
      await login(em, pw, role, role === "agent" ? npn : undefined);
      navigate(role === "agent" ? "/agent" : "/admin", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password, defaults.npn);
  }

  return (
    <div className="container narrow">
      <h1>{role === "admin" ? "CMS Administrator sign in" : "Agent / Broker sign in"}</h1>
      <p className="hint">
        Authenticated via Amazon Cognito (cognito-local in this prototype). Demo credentials are
        pre-filled.
      </p>
      <form onSubmit={onSubmit} className="card">
        {expired && !error && (
          <div className="alert warning" role="alert">
            Your session has expired. Please sign in again.
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <div style={{ marginTop: "1rem" }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
