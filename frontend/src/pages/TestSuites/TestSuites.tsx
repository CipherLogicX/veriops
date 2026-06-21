import { useEffect, useState, FormEvent } from "react";
import { request, ApiError } from "@/services/apiClient";
import type { SuiteOut } from "@/types";
import Modal from "@/components/Modal";

interface Props { projectId: string; onSuiteChange?: () => void; }

export default function TestSuites({ projectId, onSuiteChange }: Props) {
  const [suites, setSuites] = useState<SuiteOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<SuiteOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", parent_id: "" });

  const load = () => {
    setLoading(true);
    request<SuiteOut[]>(`/projects/${projectId}/suites`)
      .then(setSuites).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const body = { name: form.name, description: form.description || null,
                     parent_id: form.parent_id || null };
      if (editing) {
        await request(`/suites/${editing.id}`, { method: "PATCH", body });
        flash("Suite updated.");
      } else {
        await request(`/projects/${projectId}/suites`, { method: "POST", body });
        flash("Suite created.");
      }
      setShow(false); setEditing(null); setForm({ name: "", description: "", parent_id: "" });
      load(); onSuiteChange?.();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Failed."); }
    finally { setBusy(false); }
  };

  const onDelete = async (s: SuiteOut) => {
    if (!confirm(`Delete suite "${s.name}"? Test cases will be unassigned.`)) return;
    try { await request(`/suites/${s.id}`, { method: "DELETE" }); flash("Suite deleted."); load(); onSuiteChange?.(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed."); }
  };

  const openEdit = (s: SuiteOut) => {
    setEditing(s); setForm({ name: s.name, description: s.description || "", parent_id: s.parent_id || "" });
    setShow(true);
  };

  const rootSuites = suites.filter(s => !s.parent_id);
  const childSuites = (parentId: string) => suites.filter(s => s.parent_id === parentId);

  const SuiteRow = ({ s, depth = 0 }: { s: SuiteOut; depth?: number }) => (
    <>
      <tr>
        <td style={{ paddingLeft: 16 + depth * 20 }}>{depth > 0 && "↳ "}{s.name}</td>
        <td className="muted">{s.description || "—"}</td>
        <td>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="sm secondary" onClick={() => openEdit(s)}>Edit</button>
            <button className="sm danger" onClick={() => onDelete(s)}>Delete</button>
          </div>
        </td>
      </tr>
      {childSuites(s.id).map(c => <SuiteRow key={c.id} s={c} depth={depth + 1} />)}
    </>
  );

  return (
    <>
      <div className="page-head">
        <h1 style={{ fontSize: 16 }}>Test Suites</h1>
        <div className="spacer" />
        <button onClick={() => { setEditing(null); setForm({ name: "", description: "", parent_id: "" }); setShow(true); }}>
          + New Suite
        </button>
      </div>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}
      <div className="card">
        {loading ? <div className="empty">Loading…</div>
          : suites.length === 0 ? <div className="empty">No suites yet. Create one to organise test cases.</div>
          : <table className="tq-basic-table">
              <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>{rootSuites.map(s => <SuiteRow key={s.id} s={s} />)}</tbody>
            </table>}
      </div>

      {show && (
        <Modal title={editing ? "Edit Suite" : "New Suite"} onClose={() => { setShow(false); setEditing(null); }}>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={onSubmit}>
            <div className="field"><label>Name</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field"><label>Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="field"><label>Parent suite (optional)</label>
              <select value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">— None (top level) —</option>
                {suites.filter(s => s.id !== editing?.id).map(s =>
                  <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setShow(false)}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Update" : "Create"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
