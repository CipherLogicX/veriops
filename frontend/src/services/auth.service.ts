// Auth service — all session logic lives in AuthContext.
// This file exists for any components that import getMe directly.
import { request } from "./apiClient";
import type { Me } from "@/types";

export async function getMe(): Promise<Me> {
  return request<Me>("/auth/me");
}
