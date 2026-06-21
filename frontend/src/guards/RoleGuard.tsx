import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";

// Restricts a route subtree to admin users only.
export default function RoleGuard({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.is_admin) return <Navigate to="/app/dashboard" replace />;
  return <Outlet />;
}
