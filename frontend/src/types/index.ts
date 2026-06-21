export interface Me {
  id: string; email: string; full_name: string; is_active: boolean;
  organization_id: string; roles: string[]; is_admin: boolean;
}
export interface Project {
  id: string; key: string; name: string; description: string | null;
  status: string; created_at: string;
}
export interface SuiteOut {
  id: string; project_id: string; parent_id: string | null;
  name: string; description: string | null; sort_order: number; created_at: string;
}
export interface TestCase {
  id: string; key: string; project_id: string; suite_id: string | null;
  title: string; description: string | null; preconditions: string | null;
  steps: string | null; expected_result: string | null; priority: string;
  status: string; created_at: string;
}
export interface TestResult {
  id: string; test_run_id: string; test_case_id: string; status: string; comment: string | null;
}
export interface TestRun {
  id: string; key: string; project_id: string; name: string; status: string; created_at: string;
  test_result_id: string | null;
  test_case_key: string | null;
  test_case_title: string | null;
  current_result: string | null;
  linked_defect_key: string | null;
  linked_defect_id: string | null;
}
export interface TestRunDetail extends TestRun { results: TestResult[]; }
export interface Defect {
  id: string; key: string; project_id: string; title: string; description: string | null;
  severity: string; status: string; assignee_id: string | null; test_result_id: string | null; created_at: string;
}
export interface DefectDetail extends Defect {
  assignee_name: string | null;
  test_case_key: string | null;
  test_case_title: string | null;
  test_run_key: string | null;
  test_run_name: string | null;
  updated_at: string | null;
}
export interface ProjectReport {
  project_id: string; project_key: string;
  total_test_cases: number; total_test_runs: number;
  results_passed: number; results_failed: number; results_blocked: number; results_untested: number;
  open_defects: number; closed_defects: number; defects_by_severity: Record<string, number>;
}
export interface AuditLog {
  id: string; actor_id: string | null; action: string;
  entity_type: string; entity_id: string | null; created_at: string;
}
export interface AIGeneratedTestCase {
  title: string; preconditions: string | null; steps: string; expected_result: string;
  priority: string; severity: string; test_type: string;
}
export interface AIGenerateResponse {
  test_cases: AIGeneratedTestCase[]; coverage_notes: string | null; ai_model: string;
}


export interface Page<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}
