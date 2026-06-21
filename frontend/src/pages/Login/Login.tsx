import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { ApiError } from "@/services/apiClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { login } = useAuth();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      nav("/app/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at top left, #2563eb 0, transparent 32%), linear-gradient(135deg, #020617 0%, #0f172a 55%, #1e293b 100%)",
      padding: 24
    }}>
      <div style={{
        width: "100%",
        maxWidth: 430,
        background: "rgba(15, 23, 42, 0.92)",
        borderRadius: 22,
        padding: 36,
        boxShadow: "0 30px 90px rgba(0, 0, 0, 0.55)",
        border: "1px solid rgba(148, 163, 184, 0.22)"
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#f8fafc", letterSpacing: "-0.04em" }}>
            Track<span style={{ color: "#2563eb" }}>QA</span>
          </div>
          <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 14 }}>
            Internal QA, test case, run, and defect management.
          </p>
        </div>

        {error && (
          <div className="error-msg" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="Enter your email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" disabled={busy} style={{
            width: "100%",
            height: 48,
            marginTop: 8,
            fontWeight: 800,
            borderRadius: 12
          }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
