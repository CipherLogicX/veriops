import { request } from "./apiClient";
import type { Me, AuditLog, Page } from "@/types";

interface RoleDef {
  key: string;
  name: string;
  is_admin: boolean;
}

interface Integration {
  id: string;
  provider: string;
  name: string;
  is_enabled: boolean;
}

export const listUsers = () => request<Me[]>("/admin/users");

export const createUser = (data: {
  email: string;
  full_name: string;
  password: string;
  role_keys: string[];
}) => request<Me>("/admin/users", { method: "POST", body: data });

export const updateUser = (
  id: string,
  data: {
    full_name?: string;
    password?: string;
    role_keys?: string[];
    is_active?: boolean;
  }
) => request<Me>(`/admin/users/${id}`, { method: "PUT", body: data });

export const deleteUser = (id: string) =>
  request<void>(`/admin/users/${id}`, { method: "DELETE" });

export const listRoles = () => request<RoleDef[]>("/admin/roles");
export const listAuditLogs = (page = 1, pageSize = 20) =>
  request<Page<AuditLog>>(`/admin/audit-logs?page=${page}&page_size=${pageSize}`);
export const listIntegrations = () => request<Integration[]>("/admin/integrations");
