import { useState, FormEvent } from "react";
import { generateTestCases } from "@/services/ai.service";
import { createTestCase } from "@/services/testCases.service";
import type { AIGeneratedTestCase } from "@/types";
import Badge from "@/components/Badge";
import { ApiError } from "@/services/apiClient";

export default function AITestGenerator({ projectId }: { projectId: string }) {
  const [requirements, setRequirements] = useState("");
  const [context, setContext] = useState("");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AIGeneratedTestCase[] | null>(null);
  const [, setAiModel] = useState("");
  const [coverageNotes, setCoverageNotes] = useState<string | null>(null);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setResults(null); setSaved(false);
    try {
      const resp = await generateTestCases(projectId, requirements, count, context || undefined);
      setResults(resp.test_cases);
      setAiModel(resp.ai_model);
      setCoverageNotes(resp.coverage_notes);
      setApproved(new Set(resp.test_cases.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "AI generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) =>
    setApproved((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const saveApproved = async () => {
    if (!results) return;
    setSaving(true); setError(null);
    try {
      for (const i of Array.from(approved).sort()) {
        const tc = results[i];
        await createTestCase(projectId, {
          title: tc.title,
          preconditions: tc.preconditions ?? undefined,
          steps: tc.steps,
          expected_result: tc.expected_result,
          priority: tc.priority,
        });
      }
      setSaved(true); setResults(null); setRequirements(""); setContext("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save test cases.");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 16 }}>AI Test Case Generator</h1>
          <span className="muted" style={{ fontSize: 12 }}>Paste requirements → AI drafts test cases → Review → Save to project</span>
        </div>
      </div>

      {saved && (
        <div style={{ background: "rgba(63,185,80,0.12)", border: "1px solid rgba(63,185,80,0.4)", color: "var(--green)", padding: "9px 12px", borderRadius: "var(--radius)", marginBottom: 16, fontSize: 13 }}>
          ✓ Test cases saved to project.
        </div>
      )}

      {!results && (
        <div className="card">
          <form onSubmit={generate}>
            <div className="field">
              <label>Requirements / User Story / Feature Description</label>
              <textarea value={requirements} required rows={8} placeholder="Paste your requirements, acceptance criteria, or feature description here..." onChange={(e) => setRequirements(e.target.value)} />
            </div>
            <div className="field">
              <label>Additional Context (optional)</label>
              <textarea value={context} rows={3} placeholder="e.g. tech stack, known edge cases, security concerns..." onChange={(e) => setContext(e.target.value)} />
            </div>
            <div className="field" style={{ width: 200, maxWidth: "100%" }}>
              <label>Number of test cases</label>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[3, 5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" disabled={loading}>{loading ? "Generating…" : "⚡ Generate Test Cases"}</button>
          </form>
        </div>
      )}

      {results && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span className="muted" style={{ fontSize: 12 }}>{results.length} draft cases</span>
            <div style={{ flex: 1 }} />
            <button className="secondary sm" onClick={() => setResults(null)}>← Start over</button>
            <button onClick={saveApproved} disabled={saving || approved.size === 0}>{saving ? "Saving…" : `✓ Save ${approved.size} selected`}</button>
          </div>
          {coverageNotes && <div className="card" style={{ marginBottom: 12, fontSize: 13 }}><h3>Coverage Notes</h3><p style={{ color: "var(--text-dim)", marginTop: 6 }}>{coverageNotes}</p></div>}
          {error && <div className="error-msg">{error}</div>}
          {results.map((tc, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, borderColor: approved.has(i) ? "rgba(47,129,247,0.5)" : "var(--border)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <input type="checkbox" style={{ width: "auto", marginTop: 3, flexShrink: 0 }} checked={approved.has(i)} onChange={() => toggle(i)} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <strong style={{ fontSize: 14 }}>{tc.title}</strong>
                    <Badge value={tc.priority} />
                    <Badge value={tc.test_type} />
                  </div>
                  {tc.preconditions && <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}><strong>Preconditions:</strong> {tc.preconditions}</p>}
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    <strong style={{ color: "var(--text-dim)", fontSize: 11, textTransform: "uppercase" }}>Steps</strong>
                    <p style={{ whiteSpace: "pre-line", marginTop: 2 }}>{tc.steps}</p>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <strong style={{ color: "var(--text-dim)", fontSize: 11, textTransform: "uppercase" }}>Expected Result</strong>
                    <p style={{ marginTop: 2, color: "var(--green)" }}>{tc.expected_result}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="secondary" onClick={() => setResults(null)}>← Start over</button>
            <button onClick={saveApproved} disabled={saving || approved.size === 0}>{saving ? "Saving…" : `✓ Save ${approved.size} selected to project`}</button>
          </div>
        </div>
      )}
    </div>
  );
}
