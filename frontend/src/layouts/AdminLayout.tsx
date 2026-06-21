import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";

const ADMIN_NAV = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/audit-logs", label: "Audit Logs" },
  { to: "/admin/settings/integrations", label: "Settings · Integrations" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="nav-section">Admin Console</div>
        {ADMIN_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            {n.label}
          </NavLink>
        ))}
        <div className="nav-section">Back</div>
        <NavLink to="/app/dashboard" className="nav-link">← Workspace</NavLink>
        <div className="sidebar-foot">
          <div className="who"><b>{user?.full_name}</b><span className="muted">Administrator</span></div>
          <button className="secondary sm" onClick={logout} style={{ width: "100%" }}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="crumb">Admin Console</span>
</header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
