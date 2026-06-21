import { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { listAuditLogs } from "@/services/admin.service";
import type { AuditLog } from "@/types";

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [colWidths, setColWidths] = useState([180, 260, 180, 260, 220]);

  const formatLabel = (value?: string) =>
    value ? value.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

  useEffect(() => {
    setLoading(true);
    setError(null);

    listAuditLogs(page, pageSize)
      .then((data) => {
        setLogs(data.items || []);
        setTotal(data.total || 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[index];

    const onMove = (ev: MouseEvent) => {
      const next = [...colWidths];
      next[index] = Math.max(80, startWidth + ev.clientX - startX);
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

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "created_at",
        header: "Time",
        cell: (info) => (
          <span className="muted" title={new Date(String(info.getValue())).toLocaleString()}>
            {new Date(String(info.getValue())).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => {
          const isDelete = row.original.action?.includes("delete");
          return (
            <span
              title={formatLabel(row.original.action)}
              style={{
                display: "inline-block",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                background: isDelete ? "rgba(239,68,68,.12)" : "rgba(59,130,246,.12)",
                color: isDelete ? "#f87171" : "#60a5fa",
                padding: "4px 8px",
                borderRadius: "7px",
                fontSize: "12px",
                border: isDelete ? "1px solid rgba(239,68,68,.2)" : "1px solid rgba(59,130,246,.2)",
              }}
            >
              {formatLabel(row.original.action)}
            </span>
          );
        },
      },
      {
        accessorKey: "entity_type",
        header: "Entity Type",
        cell: (info) => (
          <span title={formatLabel(String(info.getValue() || ""))}>
            {formatLabel(String(info.getValue() || ""))}
          </span>
        ),
      },
      {
        id: "target_reference",
        header: "Target Reference",
        accessorFn: (row) => row.target_email || row.entity_id || "—",
        cell: (info) => (
          <span style={{ color: "#3b82f6" }} title={String(info.getValue() || "")}>
            {String(info.getValue() || "—")}
          </span>
        ),
      },
      {
        id: "authorized_actor",
        header: "Authorized Actor",
        accessorFn: (row) =>
          row.actor_email || row.actor_name || (row.actor_id ? `ID: ${row.actor_id.slice(0, 8)}…` : "system"),
        cell: (info) => <span title={String(info.getValue() || "")}>{String(info.getValue() || "system")}</span>,
      },
    ],
    []
  );

  const table = useReactTable({
    data: logs,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  return (
    <>
      <div className="page-head">
        <h1>Audit Logs</h1>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="card tq-table-card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="empty">No audit activity yet.</div>
        ) : (
          <>
            <div className="tq-table-wrap">
              <table className="tq-table" style={{ width: `${colWidths.reduce((sum, w) => sum + w, 0)}px`, minWidth: "100%" }}>
                <colgroup>
                  {colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
                </colgroup>
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header, index) => (
                        <th key={header.id}>
                          <button type="button" className="tq-th-button" onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <span className="tq-sort">{{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? ""}</span>
                          </button>
                          {index < hg.headers.length - 1 && (
                            <span className="tq-resizer" onMouseDown={(e) => startResize(index, e)} onDoubleClick={() => autoFitColumn(index)} />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} onClick={() => setSelectedLog(row.original)} style={{ cursor: "pointer" }}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tq-pagination">
              <span>{startRow}-{endRow} of {total}</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>Rows: {n}</option>)}
              </select>
              <button className="secondary sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
              <span>Page {page} / {pageCount}</span>
              <button className="secondary sm" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>Next</button>
            </div>
          </>
        )}
      </div>

      {selectedLog && (
        <div className="tq-modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="tq-audit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tq-audit-modal-header">
              <div>
                <h3>Audit Log Details</h3>
                <p>Review the selected audit event information.</p>
              </div>

              <button type="button" className="tq-audit-modal-close" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>

            <div className="tq-audit-modal-body">
              <div className="tq-audit-detail-row">
                <span>Action</span>
                <strong>{String((selectedLog as any).action ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</strong>
              </div>

              <div className="tq-audit-detail-row">
                <span>Entity Type</span>
                <strong>{String((selectedLog as any).entity_type ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</strong>
              </div>

              <div className="tq-audit-detail-row">
                <span>Target</span>
                <strong>{(selectedLog as any).target_reference ?? (selectedLog as any).target_ref ?? (selectedLog as any).target ?? (selectedLog as any).entity_reference ?? "-"}</strong>
              </div>

              <div className="tq-audit-detail-row">
                <span>Actor</span>
                <strong>{(selectedLog as any).authorized_actor ?? (selectedLog as any).actor ?? (selectedLog as any).actor_email ?? (selectedLog as any).user_email ?? "-"}</strong>
              </div>

              <div className="tq-audit-detail-row">
                <span>Time</span>
                <strong>{(selectedLog as any).created_at ? new Date((selectedLog as any).created_at).toLocaleString() : "-"}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
