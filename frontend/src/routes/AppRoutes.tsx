import { Routes, Route, Navigate } from "react-router-dom";

import AuthGuard from "@/guards/AuthGuard";
import RoleGuard from "@/guards/RoleGuard";

import AuthLayout from "@/layouts/AuthLayout";
import WorkspaceLayout from "@/layouts/WorkspaceLayout";
import AdminLayout from "@/layouts/AdminLayout";

import Login from "@/pages/Login/Login";
import Dashboard from "@/pages/Dashboard/Dashboard";
import Projects from "@/pages/Projects/Projects";
import ProjectDetails from "@/pages/Projects/ProjectDetails";
import AdminUsers from "@/pages/Admin/AdminUsers";
import AdminAuditLogs from "@/pages/Admin/AdminAuditLogs";
import AdminIntegrations from "@/pages/Admin/AdminIntegrations";

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* Authenticated workspace (any logged-in user) */}
      <Route element={<AuthGuard />}>
        <Route element={<WorkspaceLayout />}>
          <Route path="/app/dashboard" element={<Dashboard />} />
          <Route path="/app/projects" element={<Projects />} />
          <Route path="/app/projects/:projectId" element={<ProjectDetails />} />
        </Route>

        {/* Admin console — admin role required (RoleGuard redirects non-admins) */}
        <Route element={<RoleGuard adminOnly />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
            <Route path="/admin/settings/integrations" element={<AdminIntegrations />} />
          </Route>
        </Route>
      </Route>

      {/* Defaults */}
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
