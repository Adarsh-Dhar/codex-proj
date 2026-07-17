import type { ValidationIssue, ValidationReport } from "@/lib/types";

type ValidationPanelProps = {
  report: ValidationReport | null;
  onFixViolation: (violation: ValidationIssue) => void;
  fixing?: boolean;
};

export default function ValidationPanel({ report, onFixViolation, fixing = false }: ValidationPanelProps) {
  if (!report) return null;
  const issues = report.violations;
  return (
    <section className="validation-panel" aria-label="Validation report">
      <div className="section-heading"><span>Safety report</span><span>{issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Passed"}</span></div>
      {issues.length ? <div className="validation-list">
        {issues.map((issue, index) => <article className={`validation-issue validation-issue--${issue.severity}`} key={`${issue.rule}-${index}`}>
          <strong>{issue.rule}</strong><small>{issue.file}</small><p>{issue.detail}</p>
          <button type="button" disabled={fixing} onClick={() => onFixViolation(issue)}>Fix with AI</button>
        </article>)}
      </div> : <p className="validation-pass">No static safety violations found.</p>}
      {report.repairs.length ? <div className="repair-list"><span>Auto-repairs</span>{report.repairs.map((repair, index) => <p key={`${repair.file}-${index}`}><code>{repair.file}</code>{repair.detail}</p>)}</div> : null}
    </section>
  );
}
