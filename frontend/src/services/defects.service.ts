import { request } from "./apiClient";
import type { Defect, DefectDetail } from "@/types";

export const listDefects = (projectId: string) =>
  request<Defect[]>(`/projects/${projectId}/defects`);

export const createDefect = (projectId: string, data: Partial<Defect>) =>
  request<Defect>(`/projects/${projectId}/defects`, {
    method: "POST",
    body: data,
  });

export const getDefect = (defectId: string) =>
  request<DefectDetail>(`/defects/${defectId}`);

export const updateDefect = (defectId: string, data: Partial<Defect>) =>
  request<Defect>(`/defects/${defectId}`, { method: "PATCH", body: data });
