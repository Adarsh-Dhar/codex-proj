type RealRunStageProps = {
  running: boolean;
  statusLog: string[];
  screenshotDataUrl: string;
  errorMessage: string;
  onRun: (action?: "load" | "click-primary") => void;
  canRun: boolean;
};

export default function RealRunStage({ running, statusLog, screenshotDataUrl, errorMessage, onRun, canRun }: RealRunStageProps) {
  if (screenshotDataUrl) return <section className="real-stage"><div className="stage-topline"><span className="stage-dot" />Real Chromium result</div><div className="real-screenshot"><img src={screenshotDataUrl} alt="Screenshot captured from the real extension popup" /></div><p className="real-caption">Captured from a temporary Chromium session. This image is not interactive.</p><div className="real-actions"><button type="button" onClick={() => onRun("load")}>Run again</button><button type="button" onClick={() => onRun("click-primary")}>Test primary button</button></div></section>;
  if (running) return <section className="real-stage"><div className="stage-topline"><span className="stage-dot" />Running real Chromium</div><div className="real-terminal">{statusLog.map((line, index) => <p key={`${line}-${index}`}>› {line}</p>)}</div></section>;
  if (errorMessage) return <section className="real-stage"><div className="stage-topline"><span className="stage-dot" />Real run failed</div><div className="real-error"><h2>Chromium could not run this extension.</h2><p>{errorMessage}</p><button type="button" onClick={() => onRun("load")} disabled={!canRun}>Try again</button></div></section>;
  return <section className="real-stage"><div className="stage-topline"><span className="stage-dot" />Real Chromium</div><div className="stage-empty"><span className="stage-empty__mark">◉</span><h2>Run the actual extension</h2><p>Loads the ZIP into a temporary Chromium profile and captures its popup.</p><div className="real-actions"><button type="button" onClick={() => onRun("load")} disabled={!canRun}>Run real Chromium</button><button type="button" onClick={() => onRun("click-primary")} disabled={!canRun}>Run and test primary button</button></div></div></section>;
}
