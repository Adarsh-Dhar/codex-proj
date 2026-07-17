export default function ModeToggle() {
  return (
    <div className="mode-bar">
      <div>
        <span className="eyebrow">Execution mode</span>
        <div className="mode-toggle" role="group" aria-label="Execution mode">
          <button className="mode-toggle__active" type="button" aria-pressed="true"><span>◉</span> Mock sandbox</button>
          <button type="button" disabled title="Connect a local desktop runner to enable real execution."><span>◌</span> Real browser</button>
        </div>
      </div>
      <p><span>ⓘ</span> Chrome APIs are simulated; this preview does not run the extension in your browser.</p>
    </div>
  );
}
