import { request } from "./apiClient";
import type { AIGenerateResponse } from "@/types";

export const generateTestCases = (
  projectId: string,
  requirements: string,
  count = 5,
  context?: string
) =>
  request<AIGenerateResponse>(
    `/projects/${projectId}/test-cases/generate`,
    {
      method: "POST",
      body: { requirements, count, context },
    }
  );
