import { useEffect, useMemo, useState, FormEvent } from "react";
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { listUsers, createUser, updateUser, listRoles, deleteUser } from "@/services/admin.service";
import type { Me } from "@/types";
import Modal from "@/components/Modal";
import { ApiError } from "@/services/apiClient";

interface RoleDef {
  key: string;
  name: string;
  is_admin: boolean;
}

const roleClass = (role: string) =>
  `role-badge role-${role.toLowerCase().replace(/_/g, "-")}`;

export default function AdminUsers() {
  const [users, setUsers] = useState<Me[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Me | null>(null);
  const [deleting, setDeleting] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "full_name", desc: false }]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    full_name: "",
    password: "",
    role_keys: [] as string[],
    is_active: true,
  });

  const load = () => {
    setLoading(true);
    listUsers().then(setUsers).catch((e) => setError(e.message)).finally(() => setLoading(false));
    listRoles().then(setRoles).catch(() => {});
  };

  useEffect(load, []);


  const resetForm = () => {
    setForm({ email: "", full_name: "", password: "", role_keys: [], is_active: true });
  };

  const openCreate = () => {
    resetForm();
    setError(null);
    setShowCreate(true);
  };

  const openEdit = (user: Me) => {
    setError(null);
    setEditing(user);
    setForm({
      email: user.email,
      full_name: user.full_name,
      password: "",
      role_keys: user.roles,
      is_active: user.is_active,
    });
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createUser({
        email: form.email,
        full_name: form.full_name,
        password: form.password,
        role_keys: form.role_keys.filter((r) => ["SUPER_ADMIN", "PROJECT_MANAGER"].includes(r)),
      });
      resetForm();
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create user.");
    } finally {
      setBusy(false);
    }
  };

  const onUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await updateUser(editing.id, {
        full_name: form.full_name,
        password: form.password || undefined,
        role_keys: form.role_keys.filter((r) => ["SUPER_ADMIN", "PROJECT_MANAGER"].includes(r)),
        is_active: form.is_active,
      });
      setEditing(null);
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update user.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await deleteUser(deleting.id);
      setDeleting(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete user.");
    } finally {
      setBusy(false);
    }
  };

  const RolePicker = () => {
    const roleOrder = ["SUPER_ADMIN", "PROJECT_MANAGER"];

    const visibleRoles = roles
      .filter((r) => roleOrder.includes(r.key))
      .sort((a, b) => roleOrder.indexOf(a.key) - roleOrder.indexOf(b.key));

    const handleToggle = (key: string) => {
      setForm((f) => ({
        ...f,
        role_keys: f.role_keys.includes(key)
          ? f.role_keys.filter((k) => k !== key)
          : [...f.role_keys, key],
      }));
    };


    return (
      <div className="field">
        <label>Roles</label>
        <div className="role-grid">
          {visibleRoles.map((r) => (
            <label key={r.key} className="role-option">
              <input type="checkbox" checked={form.role_keys.includes(r.key)} onChange={() => handleToggle(r.key)} />
              <span>{r.name}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };
  const changeUserActive = async (user: Me, nextActive: boolean) => {
    if (user.is_active === nextActive) {
      setActiveMenuId(null);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await updateUser(user.id, {
        full_name: user.full_name,
        role_keys: user.roles.filter((r) => ["SUPER_ADMIN", "PROJECT_MANAGER"].includes(r)),
        is_active: nextActive,
      });

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u))
      );

      setActiveMenuId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update user status.");
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<ColumnDef<Me>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        cell: (info) => <span title={String(info.getValue() || "")}>{String(info.getValue() || "-")}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: (info) => <span className="muted" title={String(info.getValue() || "")}>{String(info.getValue() || "-")}</span>,
      },
      {
        accessorKey: "roles",
        header: "Roles",
        cell: ({ row }) => (
          <>
            {row.original.roles.map((role) => (
              <span key={role} className={roleClass(role)}>{role}</span>
            ))}
          </>
        ),
      },
        {
          accessorKey: "is_active",
          header: "Active",
          cell: ({ row }) => {
            const menuId = String(row.original.id);
            const isOpen = activeMenuId === menuId;

            return (
              <div className="admin-active-dropdown" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`admin-active-trigger ${row.original.is_active ? "is-active" : "is-inactive"}`}
                  disabled={busy}
                  onClick={() => setActiveMenuId(isOpen ? null : menuId)}
                >
                  {row.original.is_active ? "active" : "inactive"}
                </button>

                {isOpen && (
                  <div className="admin-active-menu">
                    <button
                      type="button"
                      className="admin-active-option is-active"
                      disabled={busy || row.original.is_active}
                      onClick={() => changeUserActive(row.original, true)}
                    >
                      active
                    </button>
                    <button
                      type="button"
                      className="admin-active-option is-inactive"
                      disabled={busy || !row.original.is_active}
                      onClick={() => changeUserActive(row.original, false)}
                    >
                      inactive
                    </button>
                  </div>
                )}
              </div>
            );
          },
        },
      {
        id: "actions",
          header: () => <span className="admin-actions-head">Actions</span>,
          enableSorting: false,
        cell: ({ row }) => (
          <div className="action-row" onClick={(e) => e.stopPropagation()}>
            <button className="secondary edit-btn" onClick={() => openEdit(row.original)}>Edit</button>
            <button
              className="secondary danger-btn"
              disabled={busy || row.original.roles.includes("SUPER_ADMIN")}
              onClick={() => setDeleting(row.original)}
            >
              Delete
            </button>
          </div>
        ),
      },
    ],
    [busy, activeMenuId]
  );
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();

    if (!q) return users;

    return users.filter((u) => {
      const email = String(u.email || "").toLowerCase();
      return email.includes(q);
    });
  }, [users, userSearch]);



  const table = useReactTable({
    data: filteredUsers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const startRow = filteredUsers.length === 0 ? 0 : table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1;
  const endRow = Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredUsers.length);

  return (
    <>
        <div className="page-head admin-users-head">
          <h1>Users</h1>
          <div className="spacer" />

          <div className="admin-users-search-wrap">
            <input
              className="admin-users-search"
              placeholder="Search users by email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            {userSearch && (
              <button
                type="button"
                className="admin-users-search-clear"
                onClick={() => setUserSearch("")}
                aria-label="Clear user search"
              >
                Clear
              </button>
            )}
          </div>

          <button className="btn-primary" onClick={openCreate}>+ New User</button>
        </div>

      {error && !showCreate && !editing && !deleting && <div className="error-msg">{error}</div>}

      <div className="card tq-table-card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty">No users yet.</div>
        ) : (
          <>
            <div className="tq-table-wrap">
                <table className="tq-table admin-users-table">
                <colgroup>
                    <col style={{ width: "120px" }} />
                    <col />
                    <col style={{ width: "220px" }} />
                    <col style={{ width: "92px" }} />
                    <col style={{ width: "170px" }} />
                  </colgroup>
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => (
                        <th
                        key={header.id}
                        className={
                          header.column.id === "is_active"
                            ? "admin-active-th"
                            : header.column.id === "actions"
                              ? "admin-actions-th"
                              : undefined
                        }
                      >
                          {header.column.id === "actions" ? (
                            <span className="admin-actions-head">Actions</span>
                          ) : (
                            <button type="button" className="tq-th-button" onClick={header.column.getToggleSortingHandler()}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <span className="tq-sort">{{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? ""}</span>
                            </button>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td
                        key={cell.id}
                        className={
                          cell.column.id === "is_active"
                            ? "admin-active-cell"
                            : cell.column.id === "actions"
                              ? "admin-actions-cell"
                              : undefined
                        }
                      >{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tq-pagination">
              <span>{startRow}-{endRow} of {filteredUsers.length}</span>
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

      {showCreate && (
        <Modal title="Create User" onClose={() => setShowCreate(false)}>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={onCreate}>
            <div className="field"><label>Full name</label><input value={form.full_name} required onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="field"><label>Email</label><input type="email" value={form.email} required onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Password</label><input type="password" value={form.password} required minLength={8} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <RolePicker />
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit User · ${editing.email}`} onClose={() => setEditing(null)}>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={onUpdate}>
            <div className="field"><label>Full name</label><input value={form.full_name} required onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email} disabled /></div>
            <div className="field"><label>New password optional</label><input type="password" value={form.password} minLength={8} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
<RolePicker />

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Delete user" onClose={() => setDeleting(null)}>
          <div className="confirm-box">
            <h3>Deactivate this account?</h3>
            <p>User <strong>{deleting.email}</strong> will be removed from the active users list.</p>
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button type="button" className="danger-btn" disabled={busy} onClick={onDelete}>{busy ? "Deleting…" : "Delete user"}</button>
          </div>
        </Modal>
      )}
    </>
  );

}
