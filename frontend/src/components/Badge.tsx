const LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  passed: "Passed",
  untested: "Untested",
  high: "High",
  medium: "Medium",
  low: "Low",
  critical: "Critical",
  resolved: "Resolved",
};

export default function Badge({ value }: { value: string }) {
  const raw = String(value || "");
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  const label = LABELS[key] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return <span className={`tq-status tq-status-${key}`}>{label}</span>;
}
