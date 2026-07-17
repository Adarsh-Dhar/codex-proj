"use client";

import { useCallback, useEffect, useState } from "react";
import ActivityLog from "@/components/sandbox/activity-log";
import DropZone from "@/components/sandbox/drop-zone";
import IframeStage from "@/components/sandbox/iframe-stage";
import ManifestPanel from "@/components/sandbox/manifest-panel";
import ModeToggle from "@/components/sandbox/mode-toggle";
import SurfaceTabs from "@/components/sandbox/surface-tabs";
import { buildSandboxDocument } from "@/lib/doc-builder";
import type { LogEntry, LoadedExtension, Surface } from "@/lib/types";
import { getSurfaces, loadZip } from "@/lib/zip-loader";

export default function SandboxPage() {
  const [extension, setExtension] = useState<LoadedExtension | null>(null);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [activeSurface, setActiveSurface] = useState<Surface | null>(null);
  const [srcDoc, setSrcDoc] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectSurface = useCallback(async (surface: Surface, current = extension) => {
    if (!current) return;
    setActiveSurface(surface);
    setLog([]);
    setError("");
    setBusy(true);
    try {
      setSrcDoc(await buildSandboxDocument(current.zip, current.baseDir, surface));
    } catch (caught) {
      setSrcDoc("");
      setError(caught instanceof Error ? caught.message : "The selected surface could not be prepared.");
    } finally {
      setBusy(false);
    }
  }, [extension]);

  const handleZipFile = useCallback(async (file: File) => {
    setBusy(true);
    setError("");
    setSrcDoc("");
    setLog([]);
    try {
      const loaded = await loadZip(file);
      const foundSurfaces = getSurfaces(loaded.manifest);
      setExtension(loaded);
      setSurfaces(foundSurfaces);
      if (!foundSurfaces.length) {
        setActiveSurface(null);
        setError("This extension has no previewable popup, options, side panel, devtools, or new-tab surface.");
        return;
      }
      await selectSurface(foundSurfaces[0], loaded);
    } catch (caught) {
      setExtension(null);
      setSurfaces([]);
      setActiveSurface(null);
      setError(caught instanceof Error ? caught.message : "This ZIP could not be opened.");
    } finally {
      setBusy(false);
    }
  }, [selectSurface]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as Partial<LogEntry> & { source?: string };
      if (data?.source !== "extension-sandbox" || typeof data.api !== "string") return;
      const api = data.api;
      setLog((entries) => [...entries, {
        api,
        detail: typeof data.detail === "string" ? data.detail : "called",
        isError: Boolean(data.isError),
        time: Date.now(),
      }].slice(-50));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="brand">
          <span className="brand-mark">⬡</span>
          <div><span>EXTENSION</span><strong>Sandbox</strong></div>
        </header>
        <DropZone onFile={handleZipFile} busy={busy && !extension} />
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        {extension ? <ManifestPanel manifest={extension.manifest} fileName={extension.fileName} /> : null}
        {surfaces.length ? <SurfaceTabs surfaces={surfaces} active={activeSurface} onSelect={selectSurface} /> : null}
        <footer className="sidebar-footer"><span>Local-only preview</span><span>v0.1</span></footer>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div><span className="eyebrow">Chrome extension inspector</span><h1>Run a safe, visual check.</h1></div>
          <span className="secure-label">◈ Isolated</span>
        </header>
        <ModeToggle />
        <div className="workspace-content">
          <IframeStage srcDoc={srcDoc} activeLabel={activeSurface?.label} loading={busy && Boolean(extension)} />
          <ActivityLog entries={log} />
        </div>
      </section>
    </main>
  );
}
