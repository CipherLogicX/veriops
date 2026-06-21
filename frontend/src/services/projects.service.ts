import { request } from "./apiClient";
import type { Project, ProjectReport } from "@/types";

export interface ProjectMember {
  user_id: string;
  email: string;
  full_name: string;
  project_role: string;
}

export interface ProjectAssignableUser {
  id: string;
  email: string;
  full_name: string;
}

export const listProjects = () => request<Project[]>("/projects");

export const getProject = (id: string) => request<Project>(`/projects/${id}`);

export const createProject = (data: { name: string; description?: string; key?: string }) =>
  request<Project>("/projects", { method: "POST", body: data });

export const updateProject = (id: string, data: { name?: string; description?: string }) =>
  request<Project>(`/projects/${id}`, { method: "PATCH", body: data });

export const updateProjectStatus = (id: string, status: string) =>
  request<Project>(`/projects/${id}/status`, { method: "PATCH", body: { status } });

export const deleteProject = (id: string) =>
  request(`/projects/${id}`, { method: "DELETE" });

export const getProjectReport = (id: string) =>
  request<ProjectReport>(`/projects/${id}/report`);

export const listProjectMembers = (id: string) =>
  request<ProjectMember[]>(`/projects/${id}/members`);

export const listProjectAssignableUsers = (id: string) =>
  request<ProjectAssignableUser[]>(`/projects/${id}/available-users`);

export const addProjectMember = (id: string, userId: string, role: string) =>
  request(`/projects/${id}/members`, { method: "POST", body: { user_id: userId, project_role: role } });

export const updateProjectMember = (id: string, userId: string, role: string) =>
  request(`/projects/${id}/members/${userId}`, { method: "PUT", body: { project_role: role } });

export const removeProjectMember = (id: string, userId: string) =>
  request(`/projects/${id}/members/${userId}`, { method: "DELETE" });
