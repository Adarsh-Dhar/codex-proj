type ModeToggleProps = {
  mode: "mock" | "real" | "pipeline";
  onChange: (mode: "mock" | "real" | "pipeline") => void;
  canRunReal: boolean;
  realRunning: boolean;
};

export default function ModeToggle({ mode, onChange, canRunReal, realRunning }: ModeToggleProps) {
  return (
    <div className="mode-bar">
      <div>
        <span className="eyebrow">Execution mode</span>
        <div className="mode-toggle" role="group" aria-label="Execution mode">
          <button className={mode === "mock" ? "mode-toggle__active" : ""} type="button" aria-pressed={mode === "mock"} onClick={() => onChange("mock")}><span>◉</span> Mock sandbox</button>
          <button className={mode === "real" ? "mode-toggle__active" : ""} type="button" aria-pressed={mode === "real"} onClick={() => onChange("real")} disabled={!canRunReal || realRunning} title={canRunReal ? "Run this ZIP in a temporary Chromium profile." : "Upload or generate an extension with a popup first."}><span>◌</span> Real browser</button>
          <button className={mode === "pipeline" ? "mode-toggle__active" : ""} type="button" aria-pressed={mode === "pipeline"} onClick={() => onChange("pipeline")}><span>◇</span> Pipeline</button>
        </div>
        {!canRunReal ? <span className="mode-hint">Upload or generate an extension with an action popup to enable Real browser.</span> : null}
      </div>
      <p><span>ⓘ</span>{mode === "mock" ? "Chrome APIs are simulated; this preview does not run the extension in your browser." : mode === "real" ? "A temporary Chromium profile loads the original extension ZIP." : "Inspect generation, validation, packaging, mock preview, and real-browser outputs."}</p>
    </div>
  );
}
