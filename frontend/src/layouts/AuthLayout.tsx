import { Outlet } from "react-router-dom";

// Layout for unauthenticated pages (login). No sidebar/chrome.
export default function AuthLayout() {
  return (
    <div className="auth-wrap">
      <Outlet />
    </div>
  );
}
