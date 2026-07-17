"use client";

import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActivityLog from "@/components/sandbox/activity-log";
import DropZone from "@/components/sandbox/drop-zone";
import IframeStage from "@/components/sandbox/iframe-stage";
import ManifestPanel from "@/components/sandbox/manifest-panel";
import ModeToggle from "@/components/sandbox/mode-toggle";
import PermissionCostPanel from "@/components/sandbox/permission-cost-panel";
import PromptBar from "@/components/sandbox/prompt-bar";
import RealRunStage from "@/components/sandbox/real-run-stage";
import SurfaceTabs from "@/components/sandbox/surface-tabs";
import ValidationPanel from "@/components/sandbox/validation-panel";
import { buildSandboxDocument } from "@/lib/doc-builder";
import { auditPermissions } from "@/lib/permission-audit";
import type { LogEntry, LoadedExtension, Surface, ValidationIssue, ValidationReport } from "@/lib/types";
import { getSurfaces, loadZip } from "@/lib/zip-loader";

const REAL_RUN_STATUS_STEPS = ["Unpacking extension ZIP", "Starting isolated Chromium", "Loading the extension", "Capturing popup screenshot"];

type GenerateResponse = {
  manifest: Record<string, unknown>;
  files: Record<string, string>;
  validationReport: ValidationReport;
  zipBase64: string;
};

export default function SandboxPage() {
  const [extension, setExtension] = useState<LoadedExtension | null>(null);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [activeSurface, setActiveSurface] = useState<Surface | null>(null);
  const [srcDoc, setSrcDoc] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [zipBase64, setZipBase64] = useState("");
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string> | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");
  const [mode, setMode] = useState<"mock" | "real">("mock");
  const [realRunning, setRealRunning] = useState(false);
  const [realStatusLog, setRealStatusLog] = useState<string[]>([]);
  const [realScreenshot, setRealScreenshot] = useState("");
  const [realError, setRealError] = useState("");

  const permissionAudit = useMemo(() => extension ? auditPermissions(extension.manifest, log) : [], [extension, log]);
  const canRunReal = Boolean(rawFile && surfaces.some((surface) => surface.key === "popup"));

  const selectSurface = useCallback(async (surface: Surface, current = extension) => {
    if (!current) return;
    setActiveSurface(surface);
    setLog([]);
    setError("");
    setBusy(true);
    try {
      setSrcDoc(await buildSandboxDocument(current.zip, current.manifest, current.baseDir, surface));
    } catch (caught) {
      setSrcDoc("");
      setError(caught instanceof Error ? caught.message : "The selected surface could not be prepared.");
    } finally {
      setBusy(false);
    }
  }, [extension]);

  const loadExtension = useCallback(async (loaded: LoadedExtension, sourceFile: File, report: ValidationReport | null = null, files: Record<string, string> | null = null, archive = "") => {
    const foundSurfaces = getSurfaces(loaded.manifest);
    setExtension(loaded);
    setRawFile(sourceFile);
    setZipBase64(archive);
    setGeneratedFiles(files);
    setValidationReport(report);
    setSurfaces(foundSurfaces);
    setMode("mock");
    setRealScreenshot("");
    setRealError("");
    if (!foundSurfaces.length) {
      setActiveSurface(null);
      setError("This extension has no previewable popup, options, side panel, devtools, or new-tab surface.");
      return;
    }
    await selectSurface(foundSurfaces[0], loaded);
  }, [selectSurface]);

  const handleZipFile = useCallback(async (file: File) => {
    setBusy(true);
    setError("");
    setSrcDoc("");
    setLog([]);
    try {
      await loadExtension(await loadZip(file), file);
    } catch (caught) {
      setExtension(null);
      setRawFile(null);
      setSurfaces([]);
      setActiveSurface(null);
      setError(caught instanceof Error ? caught.message : "This ZIP could not be opened.");
    } finally {
      setBusy(false);
    }
  }, [loadExtension]);

  const applyGeneratedResponse = useCallback(async (data: GenerateResponse, prompt: string) => {
    const bytes = base64ToBytes(data.zipBase64);
    const file = new File([bytes], "generated-extension.zip", { type: "application/zip" });
    const zip = await JSZip.loadAsync(file);
    setLastPrompt(prompt);
    await loadExtension({ zip, manifest: data.manifest, baseDir: "", fileName: file.name }, file, data.validationReport, data.files, data.zipBase64);
  }, [loadExtension]);

  const handleGenerate = useCallback(async (prompt: string) => {
    setGenerating(true);
    setError("");
    setGenerationLog(["Connecting to the extension compiler"]);
    try {
      const data = await runGenerateStream({ prompt }, setGenerationLog, setValidationReport);
      await applyGeneratedResponse(data, prompt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [applyGeneratedResponse]);

  const handleFixViolation = useCallback(async (violation: ValidationIssue) => {
    if (!generatedFiles || !lastPrompt) {
      setError("AI repairs are available for extensions created from a prompt.");
      return;
    }
    setGenerating(true);
    setError("");
    setGenerationLog(["Connecting to the repair compiler"]);
    try {
      const data = await runGenerateStream({ prompt: lastPrompt, repairViolation: violation, previousFiles: generatedFiles }, setGenerationLog, setValidationReport);
      await applyGeneratedResponse(data, lastPrompt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Repair failed.");
    } finally {
      setGenerating(false);
    }
  }, [applyGeneratedResponse, generatedFiles, lastPrompt]);

  const runReal = useCallback(async (action: "load" | "click-primary" = "load") => {
    if (!rawFile) return;
    setRealRunning(true);
    setRealError("");
    setRealScreenshot("");
    setRealStatusLog([REAL_RUN_STATUS_STEPS[0], ...(action === "click-primary" ? ["Clicking the extension's primary button"] : [])]);
    let index = 1;
    const timer = window.setInterval(() => {
      if (index >= REAL_RUN_STATUS_STEPS.length) return;
      setRealStatusLog((entries) => [...entries, REAL_RUN_STATUS_STEPS[index++]]);
    }, 900);
    try {
      const formData = new FormData();
      formData.append("file", rawFile);
      formData.append("action", action);
      const response = await fetch("/api/real-run", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The real browser run failed.");
      setRealScreenshot(data.screenshotDataUrl);
    } catch (caught) {
      setRealError(caught instanceof Error ? caught.message : "The real browser run failed.");
    } finally {
      window.clearInterval(timer);
      setRealRunning(false);
    }
  }, [rawFile]);

  const downloadZip = useCallback(() => {
    if (!rawFile) return;
    const url = URL.createObjectURL(rawFile);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = rawFile.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [rawFile]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as Partial<LogEntry> & { source?: string };
      if (data?.source !== "extension-sandbox" || typeof data.api !== "string") return;
      const api = data.api;
      setLog((entries) => [...entries, { api, detail: typeof data.detail === "string" ? data.detail : "called", isError: Boolean(data.isError), time: Date.now() }].slice(-50));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return <main className="app-shell">
    <aside className="sidebar">
      <header className="brand"><span className="brand-mark">⬡</span><div><span>EXTENSION</span><strong>Sandbox</strong></div></header>
      <PromptBar onGenerate={handleGenerate} generating={generating} statusLog={generationLog} />
      <div className="sidebar-divider"><span>or inspect a ZIP</span></div>
      <DropZone onFile={handleZipFile} busy={(busy && !extension) || generating} />
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      {extension ? <><ManifestPanel manifest={extension.manifest} fileName={extension.fileName} permissionAudit={permissionAudit} onDownload={downloadZip} /><PermissionCostPanel manifest={extension.manifest} /></> : null}
      <ValidationPanel report={validationReport} onFixViolation={handleFixViolation} fixing={generating} />
      {surfaces.length ? <SurfaceTabs surfaces={surfaces} active={activeSurface} onSelect={selectSurface} /> : null}
      <footer className="sidebar-footer"><span>Local-only preview</span><span>v0.2</span></footer>
    </aside>
    <section className="workspace">
      <header className="workspace-header"><div><span className="eyebrow">Chrome extension inspector</span><h1>Run a safe, visual check.</h1></div><span className="secure-label">◈ Isolated</span></header>
      <ModeToggle mode={mode} onChange={setMode} canRunReal={canRunReal} realRunning={realRunning} />
      <div className="workspace-content">
        {mode === "mock" ? <IframeStage srcDoc={srcDoc} activeLabel={activeSurface?.label} loading={busy && Boolean(extension)} /> : <RealRunStage running={realRunning} statusLog={realStatusLog} screenshotDataUrl={realScreenshot} errorMessage={realError} onRun={runReal} canRun={canRunReal} />}
        <ActivityLog entries={log} />
      </div>
    </section>
  </main>;
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function runGenerateStream(
  body: Record<string, unknown>,
  setStatusLog: (update: (entries: string[]) => string[]) => void,
  setReport: (report: ValidationReport | null) => void
): Promise<GenerateResponse> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.body) throw new Error("The compiler did not return a response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remaining = "";
  let result: GenerateResponse | null = null;

  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { type?: string; label?: string; error?: string; validationReport?: ValidationReport } & Partial<GenerateResponse>;
    if (event.type === "stage" && event.label) {
      setStatusLog((entries) => entries.includes(event.label!) ? entries : [...entries, event.label!]);
    } else if (event.type === "done") {
      result = event as GenerateResponse;
    } else if (event.type === "error") {
      setReport(event.validationReport ?? null);
      throw new Error(event.error ?? "Generation failed.");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    remaining += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = remaining.split("\n");
    remaining = lines.pop() ?? "";
    lines.forEach(consume);
    if (done) break;
  }
  if (remaining.trim()) consume(remaining);
  if (!result) throw new Error("The compiler finished without a result.");
  return result;
}
