import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";

export default function AuthGuard() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
