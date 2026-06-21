import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard" },
  { to: "/app/projects", label: "Projects" },
];

export default function WorkspaceLayout() {
  const { user, logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="nav-section">Workspace</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            {n.label}
          </NavLink>
        ))}
        {/* Admin Console link only renders for admins */}
        {user?.is_admin && (
          <>
            <div className="nav-section">Administration</div>
            <NavLink to="/admin/users" className="nav-link">Admin Console</NavLink>
          </>
        )}
        <div className="sidebar-foot">
          <div className="who">
            Signed in as
            <b>{user?.full_name}</b>
            <span className="muted">{user?.roles.join(", ")}</span>
          </div>
          <button className="secondary sm" onClick={logout} style={{ width: "100%" }}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="crumb">{loc.pathname.replace("/app/", "").replace("/", " / ") || "workspace"}</span>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
