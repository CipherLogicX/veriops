import { useEffect, useState } from "react";
import { getProjectReport } from "@/services/projects.service";
import type { ProjectReport } from "@/types";

export default function Reports({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);

    getProjectReport(projectId)
      .then(setReport)
      .catch((e) => setError(e.message || "Could not load report."));
  }, [projectId]);

  if (error) return <div className="error-msg">{error}</div>;
  if (!report) return <div className="empty">Loading report...</div>;

  const executed =
    Number(report.results_passed || 0) +
    Number(report.results_failed || 0) +
    Number(report.results_blocked || 0);

  const total = executed + Number(report.results_untested || 0);
  const passRate = executed > 0 ? Math.round((Number(report.results_passed || 0) / executed) * 100) : 0;

  const readiness =
    Number(report.open_defects || 0) === 0 && Number(report.results_failed || 0) === 0 && total > 0
      ? "Ready"
      : Number(report.results_failed || 0) > 0 || Number(report.open_defects || 0) > 0
      ? "Not ready"
      : "Pending execution";

  const severity = report.defects_by_severity || {};

  const exportCsv = () => {
    const rows = [
      ["Metric", "Value"],
      ["Project", report.project_key],
      ["Test cases", report.total_test_cases || 0],
      ["Test runs", report.total_test_runs || 0],
      ["Passed", report.results_passed || 0],
      ["Failed", report.results_failed || 0],
      ["Blocked", report.results_blocked || 0],
      ["Untested", report.results_untested || 0],
      ["Open defects", report.open_defects || 0],
      ["Closed defects", report.closed_defects || 0],
      ["Executed", `${executed} / ${total}`],
      ["Pass rate", `${passRate}%`],
      ["Readiness", readiness],
    ];

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trackqa-report-${report.project_key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    window.print();
  };

  const statCards = [
    ["Test Cases", report.total_test_cases || 0, "metric-teal"],
    ["Test Runs", report.total_test_runs || 0, "metric-teal"],
    ["Passed", report.results_passed || 0, "metric-good"],
    ["Failed", report.results_failed || 0, "metric-bad"],
    ["Blocked", report.results_blocked || 0, "metric-warn"],
    ["Untested", report.results_untested || 0, "metric-muted"],
  ] as const;

  return (
    <div className="report-page">
      <div className="report-head">
        <div>
          <h1>Report · {report.project_key.toUpperCase()}</h1>
          <p>Execution summary, defect status, and release readiness.</p>
        </div>
        <div className="report-actions">
          <button className="btn-view" onClick={exportCsv}>Export Excel</button>
          <button className="btn-view" onClick={exportPdf}>Export PDF</button>
        </div>
      </div>

      <div className="report-stat-grid">
        {statCards.map(([label, value, cls]) => (
          <div className="report-stat" key={label}>
            <div className={`report-num ${cls}`}>{value}</div>
            <div className="report-label">{label}</div>
          </div>
        ))}
      </div>

        <div className="report-grid report-summary-grid">
          <div className="card report-summary-card">
            <div className="report-card-title">
              <h3>Execution</h3>
              <span>{executed} of {total} executed</span>
            </div>

            <div className="report-kv-list">
              <div className="report-kv-row">
                <span>Executed</span>
                <strong>{executed} / {total}</strong>
              </div>
              <div className="report-kv-row">
                <span>Pass rate</span>
                <strong className={passRate > 0 ? "good" : "bad"}>{passRate}%</strong>
              </div>
            </div>
          </div>

          <div className="card report-summary-card">
            <div className="report-card-title">
              <h3>Defects</h3>
              <span>{report.open_defects || 0} open defects</span>
            </div>

            <div className="report-kv-list">
              <div className="report-kv-row">
                <span>Open</span>
                <strong className="bad">{report.open_defects || 0}</strong>
              </div>
              <div className="report-kv-row">
                <span>Closed / resolved</span>
                <strong className="good">{report.closed_defects || 0}</strong>
              </div>
              {Object.entries(severity).map(([sev, n]) => (
                <div className="report-kv-row" key={sev}>
                  <span>Severity · {sev}</span>
                  <strong>{n}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

      <div className="card release-card">
        <h3>Release Readiness</h3>
        <div className={
          readiness === "Ready"
            ? "readiness good"
            : readiness === "Not ready"
            ? "readiness bad"
            : "readiness warn"
        }>
          {readiness}
        </div>
        <p className="muted">Based on failed tests and open defects in this project.</p>
      </div>
    </div>
  );
}
