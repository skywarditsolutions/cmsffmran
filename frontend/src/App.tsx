import { Routes, Route, Link, Navigate } from "react-router-dom";
import { Consumer } from "./pages/Consumer";
import { AgentDashboard } from "./pages/AgentDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AgentDetailPage } from "./pages/AgentDetailPage";
import { Login } from "./pages/Login";
import { getSession } from "./lib/auth";

function Header() {
  return (
    <header className="site-header">
      <span className="brand">
        <span aria-hidden="true">🇺🇸</span> Request Assistance Now
      </span>
      <nav aria-label="Primary">
        <Link to="/assist">Get Help</Link>
        <Link to="/agent">Agent / Broker</Link>
        <Link to="/admin">CMS Admin</Link>
      </nav>
    </header>
  );
}

function RequireRole({ role, children }: { role: "agent" | "admin"; children: JSX.Element }) {
  const session = getSession();
  if (!session || session.role !== role) {
    return <Navigate to={`/login?role=${role}`} replace />;
  }
  return children;
}

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<Navigate to="/assist" replace />} />
          <Route path="/assist" element={<Consumer />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/agent"
            element={
              <RequireRole role="agent">
                <AgentDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole role="admin">
                <AdminDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/admin/agent/:npn"
            element={
              <RequireRole role="admin">
                <AgentDetailPage />
              </RequireRole>
            }
          />
        </Routes>
      </main>
    </>
  );
}
