import { useEffect, useState } from "react";
import { getTestRun, executeResult } from "@/services/testRuns.service";
import { listTestCases } from "@/services/testCases.service";
import { createDefect, listDefects } from "@/services/defects.service";
import type { TestRunDetail, TestCase, TestResult, Defect } from "@/types";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { ApiError } from "@/services/apiClient";

const STATUSES = ["Passed", "Failed", "Blocked"];

export default function TestExecution({
  runId, projectId, onBack,
}: { runId: string; projectId: string; onBack: () => void }) {
  const [run, setRun] = useState<TestRunDetail | null>(null);
  const [caseMap, setCaseMap] = useState<Record<string, TestCase>>({});
  const [defects, setDefects] = useState<Defect[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [defectFor, setDefectFor] = useState<TestResult | null>(null);
  const [activeStatusMenu, setActiveStatusMenu] = useState<string | null>(null);

  const load = async () => {
    try {
      const [r, cs, ds] = await Promise.all([
        getTestRun(runId), listTestCases(projectId), listDefects(projectId),
      ]);
      setRun(r);
      setCaseMap(Object.fromEntries(cs.map((c) => [c.id, c])));
      setDefects(ds);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load run.");
    }
  };
  useEffect(() => { void load(); }, [runId]);

  const setStatus = async (result: TestResult, status: string) => {
    try {
      const hadLinkedDefect = Boolean(defectByResult[result.id]);

      await executeResult(result.id, status, result.comment ?? null);
      await load();

      if ((status === "Failed" || status === "Blocked") && !hadLinkedDefect) {
        setDefectFor({ ...result, status });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Execution failed.");
    }
  };

  // Map: test_result_id -> linked defect (traceability).
  const defectByResult: Record<string, Defect> = Object.fromEntries(
    defects.filter((d) => d.test_result_id).map((d) => [d.test_result_id as string, d]),
  );

  if (error) return <div className="error-msg">{error}</div>;
  if (!run) return <div className="empty">Loading…</div>;

  return (
    <>
        <div className="execution-head">
          <div>
            <div className="execution-eyebrow">Test run execution</div>
            <h1>Execute · {run.name}</h1>
            <div className="execution-meta">
              <span className="key">{run.key}</span>
              <Badge value={run.status} />
            </div>
          </div>
          <button className="secondary" onClick={onBack}>← Back to runs</button>
        </div>

        <div className="card tq-table-card test-execution-card">
          <div className="tq-table-wrap">
            <table className="tq-table test-execution-table">
              <thead>
                <tr>
                  <th>Test Case</th>
                  <th>Current Result</th>
                  <th>Update Result</th>
                  <th>Linked Defect</th>
                </tr>
              </thead>
              <tbody>
                {run.results.map((res) => {
                  const tc = caseMap[res.test_case_id];
                  const linked = defectByResult[res.id];
                  return (
                    <tr key={res.id}>
                      <td className="execution-case-cell">
                        <span className="key">{tc?.key ?? "—"}</span>
                        <span>{tc?.title || "Untitled test case"}</span>
                      </td>
                      <td className="execution-result-cell"><Badge value={res.status} /></td>
                      <td className="execution-actions-cell">
                        <div className="execution-status-menu-wrap">
                          <button
                            type="button"
                            className={`execution-status-trigger status-${String(res.status).toLowerCase()}`}
                            onClick={() => setActiveStatusMenu(activeStatusMenu === res.id ? null : res.id)}
                          >
                            {res.status || "Set status"}
                            <span>▾</span>
                          </button>

                          {activeStatusMenu === res.id && (
                            <div className="execution-status-menu">
                              {STATUSES.map((nextStatus) => (
                                <button
                                  key={nextStatus}
                                  type="button"
                                  className={`execution-status-option status-${nextStatus.toLowerCase()}`}
                                  onClick={async () => {
                                    setActiveStatusMenu(null);
                                    await setStatus(res, nextStatus);
                                  }}
                                >
                                  {nextStatus}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="execution-defect-cell">
                        {linked ? (
                          <span className="execution-linked-defect">
                            <span className="key">{linked.key}</span>
                          </span>
                        ) : (res.status === "Failed" || res.status === "Blocked") ? (
                          <button className="sm danger" onClick={() => setDefectFor(res)}>+ Create defect</button>
                        ) : (
                          <span className="muted">No defect</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      {defectFor && (
        <DefectModal
          projectId={projectId}
          result={defectFor}
          caseKey={caseMap[defectFor.test_case_id]?.key ?? ""}
            caseTitle={caseMap[defectFor.test_case_id]?.title ?? ""}
          onClose={() => setDefectFor(null)}
          onCreated={async () => { setDefectFor(null); await load(); }}
        />
      )}
    </>
  );
}

function DefectModal({
  projectId, result, caseKey, caseTitle, onClose, onCreated,
}: {
  projectId: string; result: TestResult; caseKey: string; caseTitle: string;
  onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState(`Failure: ${caseKey ? `${caseKey} - ` : ""}${caseTitle}`);
  const [description, setDescription] = useState(result.comment ?? "");
  const [severity, setSeverity] = useState("high");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await createDefect(projectId, {
        title, description, severity, test_result_id: result.id,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create defect.");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Create Defect from Failed Test" onClose={onClose}>
      {error && <div className="error-msg">{error}</div>}
      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label>Severity</label>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button className="danger" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create defect"}</button>
      </div>
    </Modal>
  );
}
