import { request } from "./apiClient";
import type { TestRun, TestRunDetail } from "@/types";

export const listTestRuns = (projectId: string) =>
  request<TestRun[]>(`/projects/${projectId}/test-runs?limit=500`);

export const createTestRun = (projectId: string, name: string, testCaseIds: string[]) =>
  request<TestRun>(`/projects/${projectId}/test-runs`, {
    method: "POST",
    body: { name, test_case_ids: testCaseIds },
  });

export const getTestRun = (runId: string) =>
  request<TestRunDetail>(`/test-runs/${runId}`);

export const executeResult = (resultId: string, status: string, comment: string | null) =>
  request(`/test-results/${resultId}/execute`, {
    method: "POST",
    body: { status, comment },
  });

export const completeRun = (runId: string) =>
  request<TestRun>(`/test-runs/${runId}/complete`, { method: "PATCH" });
