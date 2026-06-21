import { request } from "./apiClient";
import type { TestCase } from "@/types";

export const listTestCases = (projectId: string) =>
  request<TestCase[]>(`/projects/${projectId}/test-cases?limit=500`);

export const createTestCase = (
  projectId: string,
  data: Partial<TestCase>,
) =>
  request<TestCase>(`/projects/${projectId}/test-cases`, {
    method: "POST",
    body: data,
  });

export const deleteTestCase = (testCaseId: string) =>
  request<void>(`/test-cases/${testCaseId}`, {
    method: "DELETE",
  });


export const updateTestCase = (
  testCaseId: string,
  data: Partial<TestCase>,
) =>
  request<TestCase>(`/test-cases/${testCaseId}`, {
    method: "PATCH",
    body: data,
  });
