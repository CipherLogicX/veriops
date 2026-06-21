import { useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { listDefects, createDefect, getDefect, updateDefect } from "@/services/defects.service";
import { listProjectAssignableUsers, type ProjectAssignableUser } from "@/services/projects.service";
import type { Defect, DefectDetail } from "@/types";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { ApiError } from "@/services/apiClient";

const DEFECT_STATUSES = ["Open","In Progress","Resolved","Retest","Closed"];

export default function Defects({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "medium", assignee_id: "" });
  const [assignableUsers, setAssignableUsers] = useState<ProjectAssignableUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedDefectIds, setSelectedDefectIds] = useState<string[]>([]);
  const [selectedDefect, setSelectedDefect] = useState<DefectDetail | null>(null);
  const [bulkAssigneeSearch, setBulkAssigneeSearch] = useState("");
  const [bulkAssigneeOpen, setBulkAssigneeOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkSeverityOpen, setBulkSeverityOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "key", desc: false }]);
  const [colWidths, setColWidths] = useState([46, 100, 520, 120, 170, 130, 170]);

  const load = () => {
    setLoading(true);
    listDefects(projectId)
      .then((data) => {
        setDefects(data);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  useEffect(() => {
    listProjectAssignableUsers(projectId)
      .then(setAssignableUsers)
      .catch((e) => setError(e.message));
  }, [projectId]);

  const assigneeLabel = (id?: string | null) => {
    if (!id) return "Unassigned";
    const user = assignableUsers.find((u) => u.id === id);
    return user?.full_name || user?.email || "Unknown user";
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };


  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[index];

    const onMove = (ev: MouseEvent) => {
      const next = [...colWidths];
      const tableWrap = document.querySelector(".tq-table-wrap") as HTMLElement | null;
      const maxTotal = tableWrap ? tableWrap.clientWidth - 8 : 1180;
      const otherTotal = next.reduce((sum, w, i) => i === index ? sum : sum + w, 0);
      const maxForColumn = Math.max(80, maxTotal - otherTotal);
      next[index] = Math.min(Math.max(80, startWidth + ev.clientX - startX), maxForColumn);
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
      const text = (cell.textContent || "").trim();
      max = Math.max(max, Math.ceil(ctx.measureText(text).width) + 42);
    }

    const next = [...colWidths];
    next[index] = Math.min(Math.max(max, 80), 720);
    setColWidths(next);
  };

  const toggleSelectedDefect = (id: string) => {
    setSelectedDefectIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const changeStatus = async (d: Defect, status: string) => {
    try {
      await updateDefect(d.id, { status });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed.");
    }
  };

  const openDefectDetails = async (defectId: string) => {
    try {
      setError(null);
      setSelectedDefect(await getDefect(defectId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load defect details.");
    }
  };

  useEffect(() => {
    const defectId = searchParams.get("defectId");
    if (!defectId) return;

    openDefectDetails(defectId);

    const next = new URLSearchParams(searchParams);
    next.delete("defectId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);


  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await createDefect(projectId, { ...form, assignee_id: form.assignee_id || null });
      setForm({ title: "", description: "", severity: "medium", assignee_id: "" });
      setShow(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create defect.");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<Defect>[] = [
          {
            id: "select",
            header: () => (
              <label className="tc-check">
                <input
                  type="checkbox"
                  aria-label="Select all visible defects"
                  checked={pageAllDefectsSelected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={togglePageDefectsSelected}
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
                  checked={selectedDefectIds.includes(row.original.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelectedDefect(row.original.id)}
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
        accessorKey: "severity",
        header: "Severity",
        cell: (info) => <Badge value={String(info.getValue())} />,
      },
        {
          id: "assignee",
          header: "Assignee",
          enableSorting: false,
          cell: ({ row }) => (
            <select
              value={row.original.assignee_id || ""}
              title={assigneeLabel(row.original.assignee_id)}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const assigneeId = e.target.value || null;
                updateDefect(row.original.id, { assignee_id: assigneeId })
                  .then((updated) => {
                    setDefects((current) =>
                      current.map((defect) => defect.id === updated.id ? updated : defect)
                    );
                  })
                  .catch((err) => setError(err instanceof ApiError ? err.message : "Assignee update failed."));
              }}
              style={{ width: 150 }}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
          ),
        },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info) => <Badge value={String(info.getValue())} />,
      },
      {
        id: "update_status",
        header: "Update Status",
        enableSorting: false,
        cell: ({ row }) => (
          <select
            value={row.original.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => changeStatus(row.original, e.target.value)}
            style={{ width: 140 }}
          >
            {DEFECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ),
      },
    ];

  const table = useReactTable({
    data: defects,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const visibleDefectPageIds = table.getRowModel().rows.map((row) => row.original.id);

  const pageAllDefectsSelected =
    visibleDefectPageIds.length > 0 && visibleDefectPageIds.every((id) => selectedDefectIds.includes(id));

  const togglePageDefectsSelected = () => {
    setSelectedDefectIds((current) => {
      const currentPageAllSelected =
        visibleDefectPageIds.length > 0 && visibleDefectPageIds.every((id) => current.includes(id));

      if (currentPageAllSelected) {
        return current.filter((id) => !visibleDefectPageIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleDefectPageIds]));
    });
  };

  const selectedDefectCount = selectedDefectIds.length;

  const bulkUpdateStatus = async (status: string) => {
    const ids = [...selectedDefectIds];
    if (ids.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      for (const id of ids) {
        await updateDefect(id, { status });
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      const fresh = await listDefects(projectId);
      setDefects(fresh);
      setSelectedDefectIds([]);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update selected defects.");
    } finally {
      setBusy(false);
    }
  };


  const bulkUpdateAssignee = async (assigneeId: string | null) => {
    const ids = [...selectedDefectIds];
    if (ids.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      for (const id of ids) {
        await updateDefect(id, { assignee_id: assigneeId });
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      const fresh = await listDefects(projectId);
      setDefects(fresh);
      setSelectedDefectIds([]);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign selected defects.");
    } finally {
      setBusy(false);
    }
  };


  const startRow = table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1;
  const endRow = Math.min(
    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
    defects.length
  );

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 16 }}>Defects</h1>
        <div className="spacer" />
        <button onClick={() => setShow(true)}>+ Manual Defect</button>
      </div>

      {error && <div className="error-msg">{error}</div>}
          {selectedDefectCount > 0 && (
            <div className="defects-bulk-grid">
              <div className="tc-bulk-count defects-bulk-count">
                <strong>{selectedDefectCount}</strong>
                <span>{selectedDefectCount === 1 ? "defect selected" : "defects selected"}</span>
              </div>

                <div className="defects-bulk-panel defects-bulk-panel-small">
                  <span className="defects-bulk-label">Assignee</span>
                  <div className="defects-assignee-combo">
                    <input
                      className="defects-bulk-select defects-assignee-input"
                      value={bulkAssigneeSearch}
                      placeholder="Search assignee..."
                      disabled={busy}
                      onFocus={() => setBulkAssigneeOpen(true)}
                      onBlur={() => setTimeout(() => setBulkAssigneeOpen(false), 120)}
                      onChange={(e) => {
                        setBulkAssigneeSearch(e.target.value);
                        setBulkAssigneeOpen(true);
                      }}
                    />
                    {bulkAssigneeOpen && (
                      <div className="defects-assignee-menu" onMouseDown={(e) => e.preventDefault()}>
                        <button
                          type="button"
                          className="defects-assignee-option"
                          disabled={busy}
                          onClick={() => {
                            bulkUpdateAssignee(null);
                            setBulkAssigneeSearch("");
                            setBulkAssigneeOpen(false);
                          }}
                        >
                          Unassigned
                        </button>
                        {assignableUsers
                          .filter((u) => (u.full_name || u.email).toLowerCase().includes(bulkAssigneeSearch.trim().toLowerCase()))
                          .map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              className="defects-assignee-option"
                              disabled={busy}
                              onClick={() => {
                                bulkUpdateAssignee(u.id);
                                setBulkAssigneeSearch("");
                                setBulkAssigneeOpen(false);
                              }}
                            >
                              {u.full_name || u.email}
                            </button>
                          ))}
                        {assignableUsers.filter((u) => (u.full_name || u.email).toLowerCase().includes(bulkAssigneeSearch.trim().toLowerCase())).length === 0 && (
                          <div className="defects-assignee-empty">No matches</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              <div className="defects-bulk-panel defects-bulk-panel-small">
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
                        {DEFECT_STATUSES.map((status) => (
                          <button key={status} type="button" className="defects-assignee-option" disabled={busy} onClick={() => { bulkUpdateStatus(status); setBulkStatusOpen(false); }}>
                            {status}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="defects-bulk-panel defects-bulk-panel-small">
                  <span className="defects-bulk-label">Update Severity</span>
                  <div className="defects-assignee-combo">
                    <button
                      type="button"
                      className="defects-bulk-select defects-assignee-input"
                      disabled={busy}
                      onClick={() => setBulkSeverityOpen((v) => !v)}
                      onBlur={() => setTimeout(() => setBulkSeverityOpen(false), 120)}
                    >
                      Select severity
                    </button>
                    {bulkSeverityOpen && (
                      <div className="defects-assignee-menu" onMouseDown={(e) => e.preventDefault()}>
                        {["Low", "Medium", "High", "Critical"].map((severity) => (
                          <button key={severity} type="button" className="defects-assignee-option" disabled={busy} onClick={async () => {
                            const ids = [...selectedDefectIds];
                            setBusy(true);
                            setError(null);
                            try {
                              for (const id of ids) {
                                await updateDefect(id, { severity });
                                await new Promise((resolve) => setTimeout(resolve, 180));
                              }
                              const fresh = await listDefects(projectId);
                              setDefects(fresh);
                              setSelectedDefectIds([]);
                            } catch (err) {
                              setError(err instanceof ApiError ? err.message : "Could not update selected defects.");
                            } finally {
                              setBusy(false);
                            }
                            setBulkSeverityOpen(false);
                          }}>
                            {severity}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                className="secondary sm defects-bulk-clear"
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelectedDefectIds([]);
                            }}
              >
                Clear
              </button>
            </div>
          )}

      <div className="card tq-table-card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : defects.length === 0 ? (
          <div className="empty">No defects recorded.</div>
        ) : (
          <>
            <div className="tq-table-wrap">
              <table className="tq-table defects-table">
                <colgroup>
                  {colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
                </colgroup>

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
                            <span
                              className="tq-resizer"
                              onMouseDown={(e) => startResize(index, e)}
                              onDoubleClick={() => autoFitColumn(index)}
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>

                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className={selectedDefectIds.includes(row.original.id) ? "tc-row-selected" : undefined} onClick={() => openDefectDetails(row.original.id)}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tq-pagination">
              <span>{startRow}-{endRow} of {defects.length}</span>
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
        <Modal title="Create Defect" onClose={() => setShow(false)}>
          {error && <div className="error-msg">{error}</div>}



          <div className="modal-context">
            <div>
              <strong>Manual defect</strong>
              <span>Project defect not created from a test execution.</span>
            </div>
            <Badge value="Open" />
          </div>

          <form onSubmit={onCreate}>
            <div className="field"><label>Defect title</label><input value={form.title} required onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="field"><label>Defect description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="field">
              <label>Severity</label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {["low","medium","high","critical"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
              <div className="field">
                <label>Assignee</label>
                <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShow(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedDefect && (
        <Modal title={`${selectedDefect.key} - ${selectedDefect.title}`} onClose={() => setSelectedDefect(null)}>
          <div className="modal-context">
            <div>
              <strong>{selectedDefect.key}</strong>
              <span>{selectedDefect.title}</span>
            </div>
            <Badge value={selectedDefect.status} />
          </div>

          <div className="defect-detail-grid">
            <div className="field"><label>Status</label><div>{selectedDefect.status || "-"}</div></div>
            <div className="field"><label>Severity</label><div>{selectedDefect.severity || "-"}</div></div>
            <div className="field"><label>Assignee</label><div>{selectedDefect.assignee_name || assigneeLabel(selectedDefect.assignee_id)}</div></div>
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
