import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  getProject,
  getProjectReport,
  listProjectMembers,
  listProjectAssignableUsers,
  addProjectMember,
  updateProjectMember,
  removeProjectMember,
  type ProjectMember,
  type ProjectAssignableUser,
} from "@/services/projects.service";
import { useAuth } from "@/app/AuthContext";
import type { Project, ProjectReport } from "@/types";
import TestCases from "@/pages/TestCases/TestCases";
import TestRuns from "@/pages/TestRuns/TestRuns";
import Defects from "@/pages/Defects/Defects";
import AITestGenerator from "@/pages/AI/AITestGenerator";

type Tab = "overview" | "members" | "cases" | "runs" | "defects" | "ai_gen";

const PROJECT_ROLES = ["PROJECT_MANAGER", "QA_LEAD", "TESTER", "VIEWER"];

const statusClass = (status: string) =>
  `status-${String(status || "").toLowerCase().replace(/\s+/g, "-")}`;

export default function ProjectDetails() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<ProjectAssignableUser[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memberForm, setMemberForm] = useState({ user_id: "", project_role: "TESTER" });
  const [showAddMember, setShowAddMember] = useState(false);
  const [roleMenu, setRoleMenu] = useState<{ userId: string; top: number; left: number; width: number } | null>(null);

  const loadMembers = () => {
    if (!project) return;
    listProjectMembers(project.id).then(setMembers).catch(() => {});
  };

  useEffect(() => {
    getProject(projectId).then(setProject).catch((e) => setError(e.message));
  }, [projectId]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (!requestedTab) return;

    if (["overview", "members", "cases", "runs", "defects", "ai_gen"].includes(requestedTab)) {
      setTab(requestedTab as Tab);
    }

    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    next.delete("defectId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);


  useEffect(() => {
    if (!project) return;
    getProjectReport(project.id).then(setReport).catch(() => {});
    listProjectMembers(project.id).then(setMembers).catch(() => {});
    listProjectAssignableUsers(project.id).then(setUsers).catch(() => {});
  }, [project]);

  useEffect(() => {
    setRoleMenu(null);
  }, [tab, projectId]);

  useEffect(() => {
    if (!roleMenu) return;

    const close = () => setRoleMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", close);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", close);
    };
  }, [roleMenu]);

  const currentProjectRole = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.project_role || null,
    [members, user?.id]
  );

  const canManageMembers = Boolean(user?.is_admin || currentProjectRole === "PROJECT_MANAGER");

  const availableUsers = users.filter((u) => !members.some((m) => m.user_id === u.id));

  const handleAddMember = async () => {
    if (!project || !memberForm.user_id) return;
    setBusy(true);
    setError(null);
    try {
      await addProjectMember(project.id, memberForm.user_id, memberForm.project_role);
      setMemberForm({ user_id: "", project_role: "TESTER" });
      setShowAddMember(false);
      loadMembers();
    } catch (e: any) {
      setError(e?.message || "Could not add member.");
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (member: ProjectMember, role: string) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      await updateProjectMember(project.id, member.user_id, role);
      loadMembers();
    } catch (e: any) {
      setError(e?.message || "Could not update member.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (member: ProjectMember) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      await removeProjectMember(project.id, member.user_id);
      loadMembers();
    } catch (e: any) {
      setError(e?.message || "Could not remove member.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !project) return <div className="error-msg" style={{ margin: 24 }}>{error}</div>;
  if (!project) return <div className="empty" style={{ padding: 40 }}>Loading…</div>;

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["members", "Members"],
    ["cases", "Test Cases"],
    ["runs", "Test Runs"],
    ["defects", "Defects"],
    ["ai_gen", "⚡ Generate"],
  ];

  const overviewTotalRuns = Number(report?.total_test_runs || 0);
  const overviewPassed = Number(report?.results_passed || 0);
  const overviewFailed = Number(report?.results_failed || 0);
  const overviewBlocked = Number(report?.results_blocked || 0);
  const overviewUntested = Number(report?.results_untested || 0);
  const overviewExecuted = overviewPassed + overviewFailed + overviewBlocked;
  const overviewExecutionTotal = Number(report?.total_test_cases || 0);
  const overviewPassRate = overviewExecuted > 0 ? Math.round((overviewPassed / overviewExecuted) * 100) : 0;
  const overviewReady = report ? overviewFailed === 0 && Number(report.open_defects || 0) === 0 && overviewTotalRuns > 0 : false;

  const exportOverviewCsv = () => {
    if (!report) return;

    const rows = [
      ["Project", report.project_key],
      ["Test cases", report.total_test_cases || 0],
      ["Test runs", report.total_test_runs || 0],
      ["Passed", report.results_passed || 0],
      ["Failed", report.results_failed || 0],
      ["Blocked", report.results_blocked || 0],
      ["Untested", report.results_untested || 0],
      ["Open defects", report.open_defects || 0],
      ["Closed defects", report.closed_defects || 0],
    ];

    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trackqa-overview-${report.project_key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportOverviewPdf = () => window.print();

  return (
    <>
      <div className="project-header">
        <div className="project-title-block">
          <div className="project-key-title">{project.key.toUpperCase()}</div>
          <span className={`status-pill ${statusClass(project.status)}`}>{project.status}</span>
        </div>

        <Link to="/app/projects" className="all-projects-link">
          ← All Projects
        </Link>
      </div>

      <div className="project-tabs">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            className={`project-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}

      {tab === "overview" && (
        <div className="project-overview-v2">
          <div className="overview-hero-card">
            <div>
              <h2>Project Overview</h2>
              <p>Quick summary of project scope, execution progress, and quality status.</p>
            </div>
            <div className="overview-actions">
                <button className="btn-view" onClick={exportOverviewCsv} disabled={!report}>Export Excel</button>
                <button className="btn-view" onClick={exportOverviewPdf}>Export PDF</button>
                <span className={`status-pill ${statusClass(project.status)}`}>{project.status}</span>
              </div>
          </div>

          <div className="overview-metric-grid">
            <div className="overview-metric-card"><strong>{report?.total_test_cases || 0}</strong><span>Test Cases</span><small>Total defined</small></div>
            <div className="overview-metric-card"><strong>{overviewTotalRuns}</strong><span>Test Runs</span><small>Total created</small></div>
            <div className="overview-metric-card good"><strong>{overviewPassed}</strong><span>Passed</span><small>{overviewPassRate}% pass rate</small></div>
            <div className="overview-metric-card bad"><strong>{overviewFailed}</strong><span>Failed</span><small>Needs attention</small></div>
            <div className="overview-metric-card warn"><strong>{overviewBlocked}</strong><span>Blocked</span><small>Execution blocked</small></div>
            <div className="overview-metric-card muted"><strong>{overviewUntested}</strong><span>Untested</span><small>Pending execution</small></div>
          </div>

          <div className="overview-panel-grid">
            <div className="overview-panel">
              <div className="overview-panel-head">
                <h3>Project Details</h3>
                <span>{project.key}</span>
              </div>
              <p>{project.description || <span className="muted">No description.</span>}</p>
              <div className="overview-info-row"><span>Created</span><strong>{new Date(project.created_at).toLocaleString()}</strong></div>
            </div>

            <div className="overview-panel">
              <div className="overview-panel-head">
                <h3>Quality Summary</h3>
                <span>{Number(report?.open_defects || 0)} open defects</span>
              </div>
              <div className="overview-info-row"><span>Executed</span><strong>{overviewExecuted} / {overviewExecutionTotal}</strong></div>
              <div className="overview-info-row"><span>Pass rate</span><strong className="good">{overviewPassRate}%</strong></div>
              <div className="overview-info-row"><span>Open defects</span><strong className={Number(report?.open_defects || 0) > 0 ? "bad" : "good"}>{report?.open_defects || 0}</strong></div>
            </div>
          </div>

          <div className={`overview-readiness ${overviewReady ? "ready" : "not-ready"}`}>
            <h3>{overviewReady ? "Ready" : "Not ready"}</h3>
            <p>{overviewReady ? "No failed tests or open defects detected." : "There are failed tests, blocked work, untested runs, or open defects to review."}</p>
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="card tq-table-card">
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              padding: "12px 14px",
              borderBottom: "1px solid rgba(148,163,184,.22)",
            }}
          >
            {canManageMembers && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowAddMember((v) => !v)}
              >
                + Add Member
              </button>
            )}
          </div>

          {canManageMembers && showAddMember && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 190px 120px",
                gap: 10,
                padding: 14,
                borderBottom: "1px solid rgba(148,163,184,.22)",
              }}
            >
              <select
                value={memberForm.user_id}
                onChange={(e) => setMemberForm((f) => ({ ...f, user_id: e.target.value }))}
              >
                <option value="">
                  {availableUsers.length === 0 ? "No available active users" : "Select user..."}
                </option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.email} — {u.full_name}</option>
                ))}
              </select>

              <select
                value={memberForm.project_role}
                onChange={(e) => setMemberForm((f) => ({ ...f, project_role: e.target.value }))}
              >
                {PROJECT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>

              <button
                className="btn-primary"
                disabled={busy || !memberForm.user_id}
                onClick={handleAddMember}
              >
                Add
              </button>
            </div>
          )}

          <div className="tq-table-wrap">
            <table className="tq-table">
              <colgroup>
                <col style={{ width: "45%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Project Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty">No members yet.</div></td></tr>
                ) : members.map((m) => (
                  <tr key={m.user_id}>
                    <td style={{ whiteSpace: "nowrap", overflow: "visible", textOverflow: "unset", fontWeight: 600 }}>
                      {m.email}
                    </td>
                    <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.full_name || "-"}
                    </td>
                    <td className="project-member-role-cell">
                      {canManageMembers ? (
                        <button
                          type="button"
                          className="btn-view"
                          style={{
                            width: "100%",
                            minHeight: 34,
                            background: "#081d2e",
                            color: "#e5eef8",
                            border: "1px solid rgba(0,193,222,.45)",
                            borderRadius: 8,
                            padding: "7px 10px",
                            whiteSpace: "nowrap",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setRoleMenu(
                              roleMenu?.userId === m.user_id
                                ? null
                                : {
                                    userId: m.user_id,
                                    top: r.bottom + 6,
                                    left: r.left,
                                    width: r.width,
                                  }
                            );
                          }}
                        >
                          {m.project_role}
                        </button>
                      ) : (
                        m.project_role
                      )}
                    </td>
                    <td>
                      {canManageMembers ? (
                        <button className="btn-delete" disabled={busy} onClick={() => handleRemove(m)}>
                          Remove
                        </button>
                      ) : (
                        <span className="muted">No actions</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {roleMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: roleMenu.top,
            left: roleMenu.left,
            width: roleMenu.width,
            minWidth: 190,
            background: "#071827",
            border: "1px solid rgba(0,193,222,.55)",
            borderRadius: 10,
            boxShadow: "0 18px 38px rgba(0,0,0,.55)",
            zIndex: 99999,
            overflow: "hidden",
          }}
        >
          {PROJECT_ROLES.map((r) => {
            const member = members.find((m) => m.user_id === roleMenu.userId);
            return (
              <button
                key={r}
                type="button"
                disabled={busy || member?.project_role === r}
                onClick={() => {
                  if (member) handleRoleChange(member, r);
                  setRoleMenu(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  background: member?.project_role === r ? "rgba(0,193,222,.16)" : "#081d2e",
                  color: "#e5eef8",
                  border: 0,
                  borderBottom: "1px solid rgba(148,163,184,.16)",
                  borderRadius: 0,
                  padding: "10px 12px",
                  textAlign: "left",
                  fontWeight: 900,
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      )}

      {tab === "cases" && <TestCases projectId={project.id} />}
      {tab === "runs" && <TestRuns projectId={project.id} />}
      {tab === "defects" && <Defects projectId={project.id} />}
      {tab === "ai_gen" && <AITestGenerator projectId={project.id} />}
    </>
  );
}
