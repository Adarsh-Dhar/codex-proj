type IframeStageProps = {
  srcDoc: string;
  activeLabel?: string;
  loading?: boolean;
};

export default function IframeStage({ srcDoc, activeLabel, loading = false }: IframeStageProps) {
  return (
    <section className="stage" aria-label="Extension preview">
      <div className="stage-topline">
        <span className="stage-dot" />
        <span>{activeLabel ? `${activeLabel} surface` : "No surface selected"}</span>
        <span className="stage-dim">sandboxed iframe</span>
      </div>
      <div className="stage-canvas">
        {loading ? <div className="stage-message"><span className="spinner" />Preparing preview…</div> : null}
        {!loading && !srcDoc ? (
          <div className="stage-empty">
            <span className="stage-empty__mark">◫</span>
            <h2>Your preview will appear here</h2>
            <p>Upload a Chrome extension ZIP to inspect its popup, options, or other declared surfaces.</p>
          </div>
        ) : null}
        {srcDoc ? (
          <div className="preview-shell">
            <iframe
              title={`${activeLabel ?? "Extension"} preview`}
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-forms allow-modals"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
