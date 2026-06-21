import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { listProjects, createProject, updateProjectStatus, deleteProject } from "@/services/projects.service";
import { useAuth } from "@/app/AuthContext";
import type { Project } from "@/types";
import Modal from "@/components/Modal";
import { ApiError } from "@/services/apiClient";

const ACTIONS_WIDTH = 128;
const STATUS_WIDTH = 170;
const KEY_WIDTH = 100;
const STATUSES = ["Active", "Paused", "Completed", "Archived"];

const statusClass = (status: string) =>
  `status-${String(status).toLowerCase().replace(/\s+/g, "-")}`;

const statusStyle: Record<string, CSSProperties> = {
  Active: {
    backgroundColor: "rgba(79,152,163,.18)",
    color: "#4f98a3",
    borderColor: "rgba(79,152,163,.72)",
  },
  Paused: {
    backgroundColor: "rgba(187,101,59,.18)",
    color: "#bb653b",
    borderColor: "rgba(187,101,59,.72)",
  },
  Completed: {
    backgroundColor: "rgba(109,170,69,.18)",
    color: "#6daa45",
    borderColor: "rgba(109,170,69,.72)",
  },
  Archived: {
    backgroundColor: "rgba(122,121,116,.18)",
    color: "#aaa9a4",
    borderColor: "rgba(122,121,116,.72)",
  },
};

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canDeleteProject = Boolean(user?.roles?.includes("SUPER_ADMIN"));

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [openStatusFor, setOpenStatusFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "key", desc: false }]);
  const [form, setForm] = useState({ name: "", description: "", key: "" });

  const menuRef = useRef<HTMLDivElement | null>(null);

  const load = () => {
    setLoading(true);
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenStatusFor(null);
      }
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await createProject(form);
      setForm({ name: "", description: "", key: "" });
      setShowCreate(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create project.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (project: Project, status: string) => {
    const oldStatus = project.status;

    setProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, status } : p))
    );

    setOpenStatusFor(null);
    setError(null);

    try {
      await updateProjectStatus(project.id, status);
    } catch (e) {
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, status: oldStatus } : p))
      );
      setError(e instanceof ApiError ? e.message : "Request failed. Please try again.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setBusy(true);
    setError(null);

    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return projects;

    return projects.filter((p) => {
      const name = String(p.name || "").toLowerCase();
      const key = String(p.key || "").toLowerCase();
      const status = String(p.status || "").toLowerCase();

      return name.includes(q) || key.includes(q) || status.includes(q);
    });
  }, [projects, search]);

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        accessorKey: "key",
        header: "Key",
        cell: ({ row }) => (
          <button
            className="key-link"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/app/projects/${row.original.key}`);
            }}
          >
            {row.original.key}
          </button>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: (info) => (
          <span title={String(info.getValue() || "")}>
            {String(info.getValue() || "-")}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <div
            className="status-wrap"
            ref={openStatusFor === row.original.id ? menuRef : null}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={`status-pill ${statusClass(row.original.status)}`}
              style={statusStyle[row.original.status]}
              onClick={() => setOpenStatusFor(openStatusFor === row.original.id ? null : row.original.id)}
            >
              {row.original.status}
            </button>

            <div className={`status-menu ${openStatusFor === row.original.id ? "open" : ""}`}>
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`status-option ${statusClass(status)}`}
                  style={statusStyle[status]}
                  onClick={() => changeStatus(row.original, status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="projects-actions-head">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div
            className={canDeleteProject ? "row-actions" : "row-actions row-actions-view-only"}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="btn-view" onClick={() => navigate(`/app/projects/${row.original.key}`)}>
              View
            </button>

            {canDeleteProject && (
              <button className="btn-delete" onClick={() => setDeleteTarget(row.original)}>
                Delete
              </button>
            )}
          </div>
        ),
      },
    ],
    [navigate, openStatusFor, canDeleteProject]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <div className="page-head">
        <h1>Projects</h1>
        <div className="spacer" />
        <input
          className="project-search"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {user?.is_admin && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New Project
          </button>
        )}
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="card tq-table-card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">{search ? "No matching projects." : "No projects yet."}</div>
        ) : (
          <div className="tq-table-wrap">
            <table className="tq-table projects-table-fixed">
              <colgroup>
                <col className="projects-key-col" style={{ width: `${KEY_WIDTH}px` }} />
                <col className="projects-name-col" />
                <col className="projects-status-col" style={{ width: `${STATUS_WIDTH}px` }} />
                <col className="projects-actions-col" style={{ width: `${ACTIONS_WIDTH}px` }} />
              </colgroup>

              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className={
                          header.column.id === "status"
                            ? "projects-status-th"
                            : header.column.id === "actions"
                              ? "projects-actions-th"
                              : undefined
                        }
                      >
                        {header.column.id === "actions" ? (
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
                          </>
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
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={
                          cell.column.id === "status"
                            ? "projects-status-cell"
                            : cell.column.id === "actions"
                              ? "projects-actions-cell"
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

      {showCreate && (
        <Modal title="New Project" onClose={() => setShowCreate(false)}>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={onCreate}>
            <div className="field">
              <label>Name</label>
              <input value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Key (optional — auto-generated if empty)</label>
              <input value={form.key} placeholder="e.g. MYPROJ" onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete Project" onClose={() => setDeleteTarget(null)}>
          <p className="delete-copy">
            Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
          </p>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button type="button" className="delete-confirm" disabled={busy} onClick={confirmDelete}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
