import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { listTestRuns, createTestRun, executeResult } from "@/services/testRuns.service";
import { createDefect, getDefect } from "@/services/defects.service";
import { listTestCases } from "@/services/testCases.service";
import type { TestRun, TestCase, DefectDetail } from "@/types";
import Modal from "@/components/Modal";
import { ApiError } from "@/services/apiClient";

const RESULT_STATUSES = ["Untested", "Passed", "Failed", "Blocked"];

const resultClass = (status: string) =>
  `result-${String(status).toLowerCase().replace(/\s+/g, "-")}`;

const resultStyle: Record<string, CSSProperties> = {
  Untested: { backgroundColor: "rgba(122,121,116,.18)", color: "#aaa9a4", borderColor: "rgba(122,121,116,.72)" },
  Passed: { backgroundColor: "rgba(109,170,69,.18)", color: "#6daa45", borderColor: "rgba(109,170,69,.72)" },
  Failed: { backgroundColor: "rgba(187,101,59,.18)", color: "#bb653b", borderColor: "rgba(187,101,59,.72)" },
  Blocked: { backgroundColor: "rgba(181,136,52,.18)", color: "#b58834", borderColor: "rgba(181,136,52,.72)" },
};

export default function TestRuns({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [bulkResultOpen, setBulkResultOpen] = useState(false);
  const [openResultFor, setOpenResultFor] = useState<string | null>(null);
  const [selectedDefect, setSelectedDefect] = useState<DefectDetail | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "key", desc: false }]);
  const [colWidths, setColWidths] = useState([46, 120, 650, 150, 100]);
  const resultMenuRef = useRef<HTMLDivElement | null>(null);

  const load = () => {
    setLoading(true);
    listTestRuns(projectId).then(setRuns).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (resultMenuRef.current && !resultMenuRef.current.contains(event.target as Node)) {
        setOpenResultFor(null);
      }
    };

    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const openModal = async () => {
    setShow(true);
    try {
      const allCases = await listTestCases(projectId);
      const used = new Set(runs.map((r) => `${r.test_case_key ?? ""} ${r.test_case_title ?? r.name}`.trim().toLowerCase()));
      setCases(allCases.filter((c) => !used.has(`${c.key} ${c.title}`.trim().toLowerCase())));
    } catch {
      /* ignore */
    }
  };

  const toggleCaseSelection = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const createSelectedRuns = async () => {
    const targetCases =
      selected.length > 0
        ? cases.filter((c) => selected.includes(c.id))
        : [];

    if (targetCases.length === 0) {
      setError("Select at least one test case.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      for (const testCase of targetCases) {
        await createTestRun(projectId, `${testCase.key} ${testCase.title}`.trim(), [testCase.id]);
      }

      const createdIds = new Set(targetCases.map((c) => c.id));
      setCases((current) => current.filter((c) => !createdIds.has(c.id)));
      setSelected([]);
      setShow(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create test runs.");
    } finally {
      setBusy(false);
    }
  };

  const openDefectDetails = async (defectId: string) => {
    try {
      setError(null);
      setSelectedDefect(await getDefect(defectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load defect details.");
    }
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const updateResult = async (run: TestRun, status: string) => {
    if (!run.test_result_id) return;
    setOpenResultFor(null);
    setBusy(true);
    setError(null);
    try {
      await executeResult(run.test_result_id, status, null);

      if ((status === "Failed" || status === "Blocked") && !run.linked_defect_key) {
        const testCaseLabel = `${run.test_case_key ?? ""} ${run.test_case_title ?? run.name}`.trim();

        await createDefect(projectId, {
          title: `${status}: ${testCaseLabel}`,
          description: `Auto-created from test execution result ${status}.`,
          severity: status === "Failed" ? "high" : "medium",
          test_result_id: run.test_result_id,
        });
      }

      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update result.");
    } finally {
      setBusy(false);
    }
  };

  const bulkUpdateResult = async (status: string) => {
    const selectedRuns = runs.filter((run) => selectedRunIds.includes(run.id));
    if (selectedRuns.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      for (const run of selectedRuns) {
        if (!run.test_result_id) continue;

        await executeResult(run.test_result_id, status, null);

        if ((status === "Failed" || status === "Blocked") && !run.linked_defect_key) {
          const testCaseLabel = `${run.test_case_key ?? ""} ${run.test_case_title ?? run.name}`.trim();

          await createDefect(projectId, {
            title: `${status}: ${testCaseLabel}`,
            description: `Auto-created from test execution result ${status}.`,
            severity: status === "Failed" ? "high" : "medium",
            test_result_id: run.test_result_id,
          });
        }
      }

      setSelectedRunIds([]);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update selected test runs.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectedRun = (id: string) => {
    setSelectedRunIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };


  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[index];

    const onMove = (ev: MouseEvent) => {
      const next = [...colWidths];
      next[index] = Math.min(Math.max(80, startWidth + ev.clientX - startX), 720);
      setColWidths(next);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const autoFitColumn = (index: number) => {
    const table = document.querySelector(".tq-table");
    if (!table) return;
    const cells = Array.from(table.querySelectorAll(`tr > *:nth-child(${index + 1})`));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let max = 80;
    for (const cell of cells) {
      const style = window.getComputedStyle(cell);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      max = Math.max(max, Math.ceil(ctx.measureText((cell.textContent || "").trim()).width) + 42);
    }

    const next = [...colWidths];
    next[index] = Math.min(Math.max(max, 80), 720);
    setColWidths(next);
  };

  const columns: ColumnDef<TestRun>[] = [
          {
            id: "select",
            header: () => (
              <label className="tc-check">
                <input
                  type="checkbox"
                  aria-label="Select all visible test runs"
                  checked={pageAllRunsSelected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={togglePageRunsSelected}
                />
                <span className="checkmark" />
              </label>
            ),
            enableSorting: false,
            cell: ({ row }) => (
              <label className="tc-check">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.original.key}`}
                  checked={selectedRunIds.includes(row.original.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelectedRun(row.original.id)}
                />
                <span className="checkmark" />
              </label>
            ),
          },

      { accessorKey: "key", header: "Run", cell: (info) => <span className="key">{String(info.getValue())}</span> },
      {
        id: "test_case",
        header: "Test Case",
          accessorFn: (row) => `${row.test_case_key ?? ""} ${row.test_case_title ?? row.name}`,
        cell: ({ row }) => (
          <span title={`${row.original.test_case_key ?? ""} ${row.original.test_case_title ?? row.original.name}`.trim()}>
            <span className="key">{row.original.test_case_key ?? "—"}</span>{" "}
            {row.original.test_case_title ?? row.original.name}
          </span>
        ),
      },
      {
        id: "result",
        header: "Result",
          accessorFn: (row) => row.current_result ?? "Untested",
          cell: ({ row }) => {
            const current = row.original.current_result ?? "Untested";
            const disabled = busy || !row.original.test_result_id;

            return (
              <div
                className="tr-result-wrap"
                ref={openResultFor === row.original.id ? resultMenuRef : null}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={`tr-result-pill ${resultClass(current)}`}
                  style={resultStyle[current]}
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled) {
                      setOpenResultFor(openResultFor === row.original.id ? null : row.original.id);
                    }
                  }}
                >
                  {current}
                </button>

                <div className={`tr-result-menu ${openResultFor === row.original.id ? "open" : ""}`}>
                  {RESULT_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`tr-result-option ${resultClass(status)}`}
                      style={resultStyle[status]}
                      onClick={() => updateResult(row.original, status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            );
          },
      },
      {
        id: "linked_defect",
        header: "Linked Defect",
          accessorFn: (row) => row.linked_defect_key ?? "",
        cell: ({ row }) => row.original.linked_defect_key
          ? (
            <button
              type="button"
              className="linked-defect-chip"
              onClick={(e) => {
                e.stopPropagation();
                if (row.original.linked_defect_id) openDefectDetails(row.original.linked_defect_id);
              }}
              title={`Open ${row.original.linked_defect_key}`}
            >
              {row.original.linked_defect_key}
            </button>
          )
          : <span className="muted">—</span>,
      },
    ];

  const table = useReactTable({
    data: runs,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const visibleRunPageIds = table.getRowModel().rows.map((row) => row.original.id);

  const pageAllRunsSelected =
    visibleRunPageIds.length > 0 && visibleRunPageIds.every((id) => selectedRunIds.includes(id));

  const togglePageRunsSelected = () => {
    setSelectedRunIds((current) => {
      const currentPageAllSelected =
        visibleRunPageIds.length > 0 && visibleRunPageIds.every((id) => current.includes(id));

      if (currentPageAllSelected) {
        return current.filter((id) => !visibleRunPageIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleRunPageIds]));
    });
  };

  const selectedRunCount = selectedRunIds.length;

  const startRow = table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1;
  const endRow = Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, runs.length);

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 16 }}>Test Runs</h1>
        <div className="spacer" />
        <button onClick={openModal}>+ New Test Run</button>
      </div>

      {error && !show && <div className="error-msg">{error}</div>}

      {selectedRunCount > 0 && (
        <div className="tc-bulk-bar">
          <div className="tc-bulk-count">
            <strong>{selectedRunCount}</strong>
            <span>{selectedRunCount === 1 ? "test run selected" : "test runs selected"}</span>
          </div>
            <div className="tc-bulk-actions tr-bulk-actions">
              <div className="defects-bulk-panel defects-bulk-panel-small tr-bulk-panel">
                <span className="defects-bulk-label">Update Result</span>
                <div className="defects-assignee-combo">
                  <button
                    type="button"
                    className="defects-bulk-select defects-assignee-input"
                    disabled={busy}
                    onClick={() => setBulkResultOpen((v) => !v)}
                    onBlur={() => setTimeout(() => setBulkResultOpen(false), 120)}
                  >
                    Select result
                  </button>
                  {bulkResultOpen && (
                    <div className="defects-assignee-menu" onMouseDown={(e) => e.preventDefault()}>
                      {["Passed", "Failed", "Blocked", "Untested"].map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`defects-assignee-option ${resultClass(status)}`}
                          style={resultStyle[status]}
                          disabled={busy}
                          onClick={() => {
                            bulkUpdateResult(status);
                            setBulkResultOpen(false);
                          }}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button className="secondary sm tr-bulk-clear" type="button" disabled={busy} onClick={() => setSelectedRunIds([])}>
                Clear
              </button>
            </div>
        </div>
      )}

      <div className="card tq-table-card">
        {loading ? <div className="empty">Loading…</div> : runs.length === 0 ? <div className="empty">No test runs yet.</div> : (
          <>
            <div className="tq-table-wrap">
              <table className="tq-table test-runs-table">
                <colgroup>{colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}</colgroup>
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header, index) => (
                        <th key={header.id}>
                            {header.id === "select" ? (
                              flexRender(header.column.columnDef.header, header.getContext())
                            ) : (
                              <button type="button" className="tq-th-button" onClick={header.column.getToggleSortingHandler()}>
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                <span className="tq-sort">{{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? ""}</span>
                              </button>
                            )}
                          {index > 0 && index < hg.headers.length - 1 && (
                            <span className="tq-resizer" onMouseDown={(e) => startResize(index, e)} onDoubleClick={() => autoFitColumn(index)} />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className={selectedRunIds.includes(row.original.id) ? "tc-row-selected" : undefined}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tq-pagination">
              <span>{startRow}-{endRow} of {runs.length}</span>
              <select value={table.getState().pagination.pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))}>
                {[10, 20, 50].map((n) => <option key={n} value={n}>Rows: {n}</option>)}
              </select>
              <button className="secondary sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Prev</button>
              <span>Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
              <button className="secondary sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button>
            </div>
          </>
        )}
      </div>

      {show && (
        <Modal title="Create Test Run" onClose={() => setShow(false)}>
          {error && <div className="error-msg">{error}</div>}
          <div className="field">
            <div className="test-run-select-all-row">
              <label>Available test cases {selected.length > 0 ? `(${selected.length} selected)` : ""}</label>
              <button
                type="button"
                className="secondary sm"
                onClick={() => {
                  if (selected.length === cases.length) {
                    setSelected([]);
                  } else {
                    setSelected(cases.map((c) => c.id));
                  }
                }}
                disabled={cases.length === 0}
              >
                {selected.length === cases.length && cases.length > 0 ? "Clear All" : "Select All"}
              </button>
            </div>
            <div className="test-run-case-list">
              {cases.length === 0 ? (
                <div className="muted">All test cases already have test runs.</div>
              ) : (
                cases.map((c) => (
                  <label key={c.id} className="test-run-case-row selectable">
                    <div className="test-run-case-info">
                      <input
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        onChange={() => toggleCaseSelection(c.id)}
                        style={{ width: "auto" }}
                      />
                      <span className="key">{c.key}</span>
                      <span>{c.title}</span>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setShow(false)}>Cancel</button>
            <button type="button" disabled={busy || selected.length === 0} onClick={createSelectedRuns}>
              {busy ? "Creating…" : `Create ${selected.length || ""} Run${selected.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </Modal>
      )}

      {selectedDefect && (
        <Modal title={`${selectedDefect.key} - ${selectedDefect.title}`} onClose={() => setSelectedDefect(null)}>
          <div className="modal-context">
            <div>
              <strong>{selectedDefect.key}</strong>
              <span>{selectedDefect.title}</span>
            </div>
            <span className={`status-pill ${String(selectedDefect.status || "").toLowerCase().replace(/\s+/g, "-")}`}>{selectedDefect.status}</span>
          </div>

          <div className="defect-detail-grid">
            <div className="field"><label>Status</label><div>{selectedDefect.status || "-"}</div></div>
            <div className="field"><label>Severity</label><div>{selectedDefect.severity || "-"}</div></div>
            <div className="field"><label>Assignee</label><div>{selectedDefect.assignee_name || "Unassigned"}</div></div>
            <div className="field"><label>Created At</label><div>{formatDateTime(selectedDefect.created_at)}</div></div>
            <div className="field defect-detail-wide"><label>Description</label><pre>{selectedDefect.description || "-"}</pre></div>
            <div className="field"><label>Linked Test Case</label><div>{selectedDefect.test_case_key ? `${selectedDefect.test_case_key} - ${selectedDefect.test_case_title || ""}` : "-"}</div></div>
            <div className="field"><label>Linked Test Run</label><div>{selectedDefect.test_run_key ? `${selectedDefect.test_run_key} - ${selectedDefect.test_run_name || ""}` : "-"}</div></div>
            <div className="field defect-detail-wide"><label>Updated At</label><div>{formatDateTime(selectedDefect.updated_at)}</div></div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={() => setSelectedDefect(null)}>Close</button>
          </div>
        </Modal>
      )}
    </>
  );
}
