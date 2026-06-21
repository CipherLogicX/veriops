import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { listProjects, getProjectReport } from "@/services/projects.service";
import type { Project, ProjectReport } from "@/types";

const statusClass = (status: string) =>
  `status-${String(status || "").toLowerCase().replace(/\s+/g, "-")}`;

type DashboardProjectRow = Project & {
  passed: number | string;
  failed: number | string;
  open_defects: number | string;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<Record<string, ProjectReport>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "key", desc: false }]);
  const [colWidths, setColWidths] = useState([110, 420, 169, 90, 90, 120]);

  useEffect(() => {
    listProjects()
      .then(async (ps) => {
        setProjects(ps);
        const slice = ps.slice(0, 10);
        const pairs = await Promise.allSettled(
          slice.map((p) => getProjectReport(p.id).then((rpt) => [p.id, rpt] as const))
        );
        const map: Record<string, ProjectReport> = {};
        for (const settled of pairs) {
          if (settled.status === "fulfilled") {
            map[settled.value[0]] = settled.value[1];
          }
        }
        setReports(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const startResize = (index: number, e: React.MouseEvent) => {
    if (index >= 1) return;
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
    if (index >= 1) return;
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

  const rows = useMemo<DashboardProjectRow[]>(
    () =>
      projects.slice(0, 15).map((p) => {
        const r = reports[p.id];
        return {
          ...p,
          passed: r ? r.results_passed : "—",
          failed: r ? r.results_failed : "—",
          open_defects: r ? r.open_defects : "—",
        };
      }),
    [projects, reports]
  );

  const columns = useMemo<ColumnDef<DashboardProjectRow>[]>(
    () => [
      {
        accessorKey: "key",
        header: "Key",
        cell: (info) => <span className="key-link-static">{String(info.getValue()).toUpperCase()}</span>,
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: (info) => <span title={String(info.getValue() || "")}>{String(info.getValue() || "-")}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info) => <span className={`status-pill ${statusClass(String(info.getValue()))}`}>{String(info.getValue())}</span>,
      },
      {
        accessorKey: "passed",
        header: "Passed",
        cell: (info) => <span className="metric-cell good">{String(info.getValue())}</span>,
      },
      {
        accessorKey: "failed",
        header: "Failed",
        cell: (info) => <span className="metric-cell bad">{String(info.getValue())}</span>,
      },
      {
        accessorKey: "open_defects",
        header: "Open Defects",
        cell: (info) => {
          const value = info.getValue();
          const bad = typeof value === "number" && value > 0;
          return <span className={bad ? "metric-cell bad" : "metric-cell good"}>{String(value)}</span>;
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) return <div className="empty">Loading dashboard…</div>;
  if (error) return <div className="error-msg">{error}</div>;

  const total = projects.length;
  const active = projects.filter((p) => p.status === "Active").length;
  const reportValues = Object.values(reports);
  const allPassed = reportValues.reduce((a, r) => a + r.results_passed, 0);
  const allFailed = reportValues.reduce((a, r) => a + r.results_failed, 0);
  const allDefects = reportValues.reduce((a, r) => a + r.open_defects, 0);

  const cards = [
    ["Projects", total, "metric-teal"],
    ["Active", active, "metric-good"],
    ["Tests Passed", allPassed, "metric-good"],
    ["Tests Failed", allFailed, "metric-bad"],
    ["Open Defects", allDefects, allDefects > 0 ? "metric-bad" : "metric-good"],
  ] as const;

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>

      <div className="dashboard-grid">
        {cards.map(([label, value, cls]) => (
          <div key={label} className="dashboard-card">
            <div className={`dashboard-number ${cls}`}>{value}</div>
            <div className="dashboard-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="card tq-table-card">
        <h3 style={{ padding: "14px 14px 10px", margin: 0 }}>Projects</h3>

        {projects.length === 0 ? (
          <div className="empty">No projects yet.</div>
        ) : (
          <div className="tq-table-wrap">
            <table className="tq-table dashboard-projects-table">
              <colgroup>
                  <col style={{ width: "110px" }} />
                  <col />
                  <col style={{ width: "169px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "120px" }} />
                </colgroup>

              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header, index) => (
                      <th
                          key={header.id}
                          className={
                            index === 2
                              ? "dashboard-status-th"
                              : index >= 3
                                ? "dashboard-metric-th"
                                : undefined
                          }
                        >
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

                        {index < 1 && (
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
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/app/projects/${row.original.key}`)}
                    className="click-row"
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <td
                          key={cell.id}
                          className={
                            index === 2
                              ? "dashboard-status-cell"
                              : index >= 3
                                ? "dashboard-metric-cell"
                                : undefined
                          }
                        >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
