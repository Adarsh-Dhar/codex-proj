"use client";

import { useState } from "react";
import type { LogEntry, Surface, ValidationReport } from "@/lib/types";

type StageStatus = "idle" | "running" | "done" | "error";

type PipelinePanelProps = {
  generating: boolean;
  generationLog: string[];
  lastPrompt: string;
  validationReport: ValidationReport | null;
  generatedFiles: Record<string, string> | null;
  zipBase64: string;
  activeSurface: Surface | null;
  mockBusy: boolean;
  activity: LogEntry[];
  realRunning: boolean;
  realStatusLog: string[];
  realScreenshot: string;
  realError: string;
};

type PipelineCard = {
  key: string;
  label: string;
  source: string;
  status: StageStatus;
  summary: string;
  detail: React.ReactNode;
};

export default function PipelinePanel(props: PipelinePanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const errors = props.validationReport?.violations.filter((issue) => issue.severity === "error").length ?? 0;
  const warnings = props.validationReport?.violations.filter((issue) => issue.severity === "warning").length ?? 0;
  const validationRunning = props.generating && props.generationLog.some((entry) => /security|lint|validat/i.test(entry));
  const packagingRunning = props.generating && props.generationLog.some((entry) => /vendor|bundl/i.test(entry));
  const zipBytes = props.zipBase64 ? Math.floor((props.zipBase64.length * 3) / 4) : 0;
  const cards: PipelineCard[] = [
    {
      key: "generate", label: "Generate", source: "ai-orchestrator.js",
      status: props.generating && !validationRunning ? "running" : props.lastPrompt ? "done" : "idle",
      summary: props.lastPrompt ? "Prompt compiled into an extension" : "Waiting for a prompt",
      detail: props.lastPrompt ? <><strong>Last request</strong><p>{props.lastPrompt}</p><StageList entries={props.generationLog} /></> : <p>Describe an extension in the sidebar to start the compiler.</p>
    },
    {
      key: "validate", label: "Validate", source: "validator.js + linter.js",
      status: validationRunning ? "running" : errors ? "error" : props.validationReport ? "done" : "idle",
      summary: errors ? `${errors} error${errors === 1 ? "" : "s"}${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}` : props.validationReport ? `${props.validationReport.repairs.length} repair${props.validationReport.repairs.length === 1 ? "" : "s"} applied` : "No validation result yet",
      detail: props.validationReport ? <><StageList entries={props.validationReport.violations.map((issue) => `${issue.severity}: ${issue.rule} — ${issue.detail}`)} empty="No static safety violations found." /><StageList entries={props.validationReport.repairs.map((repair) => `Repaired ${repair.file}: ${repair.detail}`)} /></> : <p>Static safety, lint, and permission checks will appear here.</p>
    },
    {
      key: "package", label: "Package", source: "packager.js",
      status: packagingRunning ? "running" : props.zipBase64 ? "done" : "idle",
      summary: props.generatedFiles ? `${Object.keys(props.generatedFiles).length} files · ${formatBytes(zipBytes)}` : "No ZIP package yet",
      detail: props.generatedFiles ? <><strong>Packaged files</strong><StageList entries={Object.keys(props.generatedFiles).sort()} /><p>{formatBytes(zipBytes)} compressed ZIP ready for download.</p></> : <p>Validated source is bundled into a sideloadable ZIP here.</p>
    },
    {
      key: "mock", label: "Mock Preview", source: "doc-builder.ts + iframe-stage.tsx",
      status: props.mockBusy ? "running" : props.activeSurface ? "done" : "idle",
      summary: props.activeSurface ? `${props.activeSurface.label} · ${props.activity.length} API call${props.activity.length === 1 ? "" : "s"}` : "No surface loaded",
      detail: props.activeSurface ? <><strong>Loaded surface</strong><p>{props.activeSurface.label}: <code>{props.activeSurface.path}</code></p><StageList entries={props.activity.slice(-8).map((entry) => `${entry.api} — ${entry.detail}`)} empty="No mock API calls recorded yet." /></> : <p>Choose a previewable extension surface to run it with mocked Chrome APIs.</p>
    },
    {
      key: "real", label: "Real Run", source: "e2e-tester.js + Chromium",
      status: props.realRunning ? "running" : props.realError ? "error" : props.realScreenshot ? "done" : "idle",
      summary: props.realError ? "Latest Chromium run failed" : props.realScreenshot ? "Popup captured in Chromium" : "Not run yet",
      detail: props.realScreenshot ? <><img className="pipeline-thumb" src={props.realScreenshot} alt="Real Chromium popup capture" /><StageList entries={props.realStatusLog} /></> : props.realError ? <p>{props.realError}</p> : <StageList entries={props.realStatusLog} empty="Switch to Real browser to run the uploaded ZIP in Chromium." />
    }
  ];

  return <section className="pipeline-panel" aria-label="Extension compiler pipeline">
    <div className="pipeline-header"><div><span className="eyebrow">Inspectable subsystems</span><h2>Extension pipeline</h2></div><p>Each card exposes output from a separate compiler layer.</p></div>
    <div className="pipeline-grid">{cards.map((card) => <article className={`pipeline-card pipeline-card--${card.status}`} key={card.key}>
      <button type="button" className="pipeline-card__trigger" onClick={() => setExpanded((current) => current === card.key ? null : card.key)} aria-expanded={expanded === card.key}>
        <span className="pipeline-card__status" /><span className="pipeline-card__label">{card.label}</span><span className="pipeline-card__chevron">{expanded === card.key ? "−" : "+"}</span>
        <small>{card.source}</small><strong>{card.summary}</strong>
      </button>
      {expanded === card.key ? <div className="pipeline-card__detail">{card.detail}</div> : null}
    </article>)}</div>
  </section>;
}

function StageList({ entries, empty }: { entries: string[]; empty?: string }) {
  if (!entries.length) return empty ? <p>{empty}</p> : null;
  return <ul className="pipeline-list">{entries.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul>;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
