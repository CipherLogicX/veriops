import { useEffect, useState, FormEvent, type CSSProperties } from "react";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { listTestCases, createTestCase, updateTestCase, deleteTestCase } from "@/services/testCases.service";
import type { TestCase } from "@/types";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { ApiError } from "@/services/apiClient";

const TEST_CASE_STATUSES = ["Draft", "Ready", "Approved"] as const;

export default function TestCases({ projectId }: { projectId: string }) {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<TestCase | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [openCaseStatusFor, setOpenCaseStatusFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "key", desc: false }]);
  const [colWidths, setColWidths] = useState([46, 140, 260, 570, 150, 150]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    preconditions: "",
    steps: "",
    expected_result: "",
    priority: "medium",
  });

  const load = () => {
    setLoading(true);
    listTestCases(projectId)
      .then(setCases)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const startResize = (index: number, e: React.MouseEvent) => {
    if (![1, 2].includes(index)) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[index];

    const onMove = (ev: MouseEvent) => {
      const next = [...colWidths];
      next[index] = Math.min(Math.max(90, startWidth + ev.clientX - startX), 900);
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
    if (![1, 2].includes(index)) return;

    const tableEl = document.querySelector(".test-cases-table");
    if (!tableEl) return;

    const cells = Array.from(tableEl.querySelectorAll(`tr > *:nth-child(${index + 1})`));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let max = 90;
    for (const cell of cells) {
      const style = window.getComputedStyle(cell);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = (cell.textContent || "").trim();
      max = Math.max(max, Math.ceil(ctx.measureText(text).width) + 44);
    }

    const next = [...colWidths];
    next[index] = Math.min(Math.max(max, 90), 900);
    setColWidths(next);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const changeStatus = async (testCase: TestCase, status: string) => {
    if (testCase.status === status) return;

    const previousCases = cases;
    setCases((current) =>
      current.map((item) => (item.id === testCase.id ? { ...item, status } : item))
    );
    setError(null);

    try {
      await updateTestCase(testCase.id, { status });
    } catch (err) {
      setCases(previousCases);
      setError(err instanceof ApiError ? err.message : "Could not update test case status.");
    }
  };

  const columns: ColumnDef<TestCase>[] = [
        {
          id: "select",
          header: () => (
            <label className="tc-check">
              <input
                type="checkbox"
                aria-label="Select all visible test cases"
                checked={pageAllSelected}
                onClick={(e) => e.stopPropagation()}
                  onChange={togglePageSelected}
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
                checked={selectedIds.includes(row.original.id)}
                onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelected(row.original.id)}
              />
              <span className="checkmark" />
            </label>
          ),
        },
      {
        accessorKey: "key",
        header: "Key",
        cell: (info) => <span className="key">{String(info.getValue())}</span>,
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: (info) => <span title={String(info.getValue() || "")}>{String(info.getValue() || "-")}</span>,
      },
      {
        accessorKey: "steps",
        header: "Steps",
        cell: (info) => {
            const value = String(info.getValue() || "-").replace(/\n/g, " ");
          return <span title={value}>{value}</span>;
        },
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: (info) => <Badge value={String(info.getValue())} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const current = row.original.status || "Draft";
          const open = openCaseStatusFor === row.original.id;

          return (
            <div className="tc-status-wrap" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`tc-status-pill tc-status-${String(current).toLowerCase()}`}
                disabled={busy}
                onClick={() => setOpenCaseStatusFor(open ? null : row.original.id)}
                onBlur={() => setTimeout(() => setOpenCaseStatusFor(null), 120)}
                aria-label={`Change status for ${row.original.key}`}
              >
                {current}
              </button>

              {open && (
                <div className="tc-status-menu" onMouseDown={(e) => e.preventDefault()}>
                  {TEST_CASE_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`tc-status-option tc-status-${String(status).toLowerCase()}`}
                      disabled={busy}
                      onClick={() => {
                        changeStatus(row.original, status);
                        setOpenCaseStatusFor(null);
                      }}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        },
      },
      ];

  const table = useReactTable({
    data: cases,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const visiblePageIds = table.getRowModel().rows.map((row) => row.original.id);

  const pageAllSelected =
    visiblePageIds.length > 0 && visiblePageIds.every((id) => selectedIds.includes(id));

  const togglePageSelected = () => {
    setSelectedIds((current) => {
      const currentPageAllSelected =
        visiblePageIds.length > 0 && visiblePageIds.every((id) => current.includes(id));

      if (currentPageAllSelected) {
        return current.filter((id) => !visiblePageIds.includes(id));
      }

      return Array.from(new Set([...current, ...visiblePageIds]));
    });
  };

  const tableWidth = colWidths.reduce((total, width) => total + width, 0);

  const tableSizingStyle = colWidths.reduce<CSSProperties & Record<string, string>>(
    (style, width, index) => {
      style[`--tc-col-${index}`] = `${width}px`;
      return style;
    },
    { "--tc-table-width": `${tableWidth}px` }
  );

  const bulkUpdateStatus = async (status: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      for (const id of ids) {
        await updateTestCase(id, { status });
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      const fresh = await listTestCases(projectId);
      setCases(fresh);
      setSelectedIds([]);
      setBulkStatusOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update selected test cases.");
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = selectedIds.length;

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      await Promise.all(selectedIds.map((id) => deleteTestCase(id)));
      setSelected((current) => current && selectedIds.includes(current.id) ? null : current);
      setSelectedIds([]);
      setConfirmDelete(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete selected test cases.");
    } finally {
      setBusy(false);
    }
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await createTestCase(projectId, form);
      setForm({ title: "", description: "", preconditions: "", steps: "", expected_result: "", priority: "medium" });
      setShow(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create test case.");
    } finally {
      setBusy(false);
    }
  };

  const startRow = table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1;
  const endRow = Math.min(
    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
    cases.length
  );

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 16 }}>Test Cases</h1>
        <div className="spacer" />
        <button onClick={() => setShow(true)}>+ New Test Case</button>
      </div>

      {error && !show && <div className="error-msg">{error}</div>}

        {selectedCount > 0 && (
          <div className="tc-bulk-bar">
            <div className="tc-bulk-count">
              <strong>{selectedCount}</strong>
              <span>{selectedCount === 1 ? "test case selected" : "test cases selected"}</span>
            </div>
              <div className="tc-bulk-actions tc-case-bulk-actions">
                <div className="defects-bulk-panel defects-bulk-panel-small tc-case-bulk-panel">
                  <span className="defects-bulk-label">Update Status</span>
                  <div className="defects-assignee-combo">
                    <button
                      type="button"
                      className="defects-bulk-select defects-assignee-input"
                      disabled={busy}
                      onClick={() => setBulkStatusOpen((v) => !v)}
                      onBlur={() => setTimeout(() => setBulkStatusOpen(false), 120)}
                    >
                      Select status
                    </button>
                    {bulkStatusOpen && (
                      <div className="defects-assignee-menu" onMouseDown={(e) => e.preventDefault()}>
                        {["Draft", "Ready", "Approved"].map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={`defects-assignee-option tc-status-${String(status).toLowerCase()}`}
                            disabled={busy}
                            onClick={() => bulkUpdateStatus(status)}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button className="secondary sm tc-case-bulk-clear" type="button" disabled={busy} onClick={() => setSelectedIds([])}>
                  Clear
                </button>
                <button className="danger sm tc-case-bulk-delete" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Delete Selected
                </button>
              </div>
          </div>
        )}

      <div className="card tq-table-card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="empty">No test cases yet.</div>
        ) : (
          <>
            <div className="tq-table-wrap">
              <table className="tq-table test-cases-table" style={tableSizingStyle}>
                <colgroup>
                  {colWidths.map((w, i) => (
                    <col key={i} style={{ width: `${w}px` }} />
                  ))}
                </colgroup>

                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header, index) => (
                        <th key={header.id}>
                            {header.id === "select" ? (
                              flexRender(header.column.columnDef.header, header.getContext())
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="tq-th-button"
                                  onClick={header.column.getToggleSortingHandler()}
                                >
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                  <span className="tq-sort">
                                    {{
                                      asc: "↑",
                                      desc: "↓",
                                    }[header.column.getIsSorted() as string] ?? ""}
                                  </span>
                                </button>
                                {[1, 2].includes(index) && (
                                  <span
                                    className="tq-resizer"
                                    onMouseDown={(e) => startResize(index, e)}
                                    onDoubleClick={() => autoFitColumn(index)}
                                  />
                                )}
                              </>
                            )}
                          </th>
                      ))}
                    </tr>
                  ))}
                </thead>

                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className={selectedIds.includes(row.original.id) ? "tc-row-selected" : undefined} onClick={() => setSelected(row.original)}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tq-pagination">
              <span>{startRow}-{endRow} of {cases.length}</span>

              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>Rows: {n}</option>
                ))}
              </select>

              <button className="secondary sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                Prev
              </button>

              <span>Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>

              <button className="secondary sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                Next
              </button>
            </div>
          </>
        )}
      </div>

        {confirmDelete && (
          <Modal title="Delete Selected Test Cases" onClose={() => setConfirmDelete(false)}>
            <div className="tc-delete-confirm">
              <div className="tc-delete-icon">!</div>
              <h3>Delete {selectedCount} {selectedCount === 1 ? "test case" : "test cases"}?</h3>
              <p>This action cannot be undone.</p>
              <div className="tc-delete-list">
                {cases
                  .filter((tc) => selectedIds.includes(tc.id))
                  .slice(0, 8)
                  .map((tc) => (
                    <div className="tc-delete-item" key={tc.id}>
                      <span className="key">{tc.key}</span>
                      <span>{tc.title}</span>
                    </div>
                  ))}
                {selectedCount > 8 && (
                  <div className="tc-delete-more">+ {selectedCount - 8} more</div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="danger" type="button" disabled={busy} onClick={deleteSelected}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Modal>
        )}

      {show && (
        <Modal title="Create Test Case" onClose={() => setShow(false)}>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={onCreate}>
            <div className="field"><label>Title</label><input value={form.title} required onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="field"><label>Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="field"><label>Steps</label><textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} /></div>
            <div className="field"><label>Expected Result</label><textarea value={form.expected_result} onChange={(e) => setForm({ ...form, expected_result: e.target.value })} /></div>
            <div className="field">
              <label>Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShow(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={`${selected.key} - ${selected.title}`} onClose={() => setSelected(null)}>
          <div className="field"><label>Description</label><div>{selected.description || "-"}</div></div>
          <div className="field"><label>Preconditions</label><div>{selected.preconditions || "-"}</div></div>
          <div className="field"><label>Steps</label><pre>{selected.steps || "-"}</pre></div>
          <div className="field"><label>Expected Result</label><pre>{selected.expected_result || "-"}</pre></div>
          <div className="modal-actions"><button type="button" onClick={() => setSelected(null)}>Close</button></div>
        </Modal>
      )}
    </>
  );
}
