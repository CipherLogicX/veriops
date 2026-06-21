// Central API client.
//
// Security model:
//   Access token  — kept in module-scope memory only (never written to storage).
//   Refresh token — stored in an HttpOnly Secure SameSite=Strict cookie by the
//                   backend on login/refresh. The browser sends it automatically;
//                   the frontend never reads or stores it.
//
// Auto-refresh: on a 401 the client silently POSTs /auth/refresh (no body needed —
// the cookie is sent automatically), gets a new access token, then retries once.

const BASE_URL = "/api/v1";

let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearAccessToken(): void {
  _accessToken = null;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: URLSearchParams;
  auth?: boolean;
  _retry?: boolean;
}

async function _doRequest<T>(path: string, opts: RequestOptions): Promise<T> {
  const { method = "GET", body, form, auth = true } = opts;
  const headers: Record<string, string> = {};

  if (auth && _accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }

  let payload: BodyInit | undefined;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = form.toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  // credentials: "include" ensures the browser sends the refresh-token HttpOnly cookie
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: payload,
    credentials: "include",
  });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      err?.message ?? "Request failed. Please try again.",
    );
  }

  return data as T;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await _doRequest<T>(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && opts.auth !== false && !opts._retry) {
      // Attempt silent refresh — cookie is sent automatically by browser
      try {
        const resp = await _doRequest<{ access_token: string }>(
          "/auth/refresh",
          { method: "POST", auth: false, _retry: true },
        );
        setAccessToken(resp.access_token);
        return await _doRequest<T>(path, { ...opts, _retry: true });
      } catch {
        clearAccessToken();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        throw e;
      }
    }
    throw e;
  }
}
