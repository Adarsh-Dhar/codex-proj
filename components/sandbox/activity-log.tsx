import type { LogEntry } from "@/lib/types";

type ActivityLogProps = { entries: LogEntry[] };

export default function ActivityLog({ entries }: ActivityLogProps) {
  return (
    <aside className="activity-log" aria-label="Sandbox activity">
      <div className="log-heading">
        <div><span className="eyebrow">Live activity</span><h2>API calls</h2></div>
        <span className="live-pill"><i /> LIVE</span>
      </div>
      <div className="log-list">
        {entries.length ? entries.map((entry, index) => (
          <article className={`log-entry ${entry.isError ? "log-entry--error" : ""}`} key={`${entry.time}-${index}`}>
            <time>{new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(entry.time)}</time>
            <strong>{entry.api}</strong>
            <p>{entry.detail}</p>
          </article>
        )) : (
          <div className="empty-log">
            <span>◌</span>
            <p>Waiting for activity</p>
            <small>Mocked Chrome API calls will appear here.</small>
          </div>
        )}
      </div>
    </aside>
  );
}
