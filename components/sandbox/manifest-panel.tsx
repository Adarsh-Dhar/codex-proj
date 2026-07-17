import type { PermissionAudit } from "@/lib/types";

type ManifestPanelProps = {
  manifest: Record<string, unknown>;
  fileName: string;
  permissionAudit?: PermissionAudit;
  onDownload?: () => void;
};

function string(value: unknown, fallback = "—") {
  return typeof value === "string" && value ? value : fallback;
}

export default function ManifestPanel({ manifest, fileName, permissionAudit = [], onDownload }: ManifestPanelProps) {
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission): permission is string => typeof permission === "string")
    : [];

  return (
    <section className="manifest-panel" aria-label="Extension manifest summary">
      <div className="section-heading">
        <span>Loaded extension</span>
        <span className="status-dot">Verified</span>
      </div>
      <h2>{string(manifest.name, "Unnamed extension")}</h2>
      <p className="filename" title={fileName}>{fileName}</p>
      <dl className="manifest-grid">
        <div><dt>Version</dt><dd>{string(manifest.version)}</dd></div>
        <div><dt>Manifest</dt><dd>V{String(manifest.manifest_version ?? "—")}</dd></div>
      </dl>
      <div className="permission-row">
        <span>Permissions</span>
        {permissions.length ? (
          <div className="permission-tags">
            {permissions.slice(0, 4).map((permission) => {
              const audit = permissionAudit.find((entry) => entry.permission === permission);
              return <code key={permission} title={audit?.justified === false ? "Unused in this preview session" : undefined}>{permission}{audit?.justified === false ? " ⚠" : ""}</code>;
            })}
            {permissions.length > 4 && <code>+{permissions.length - 4}</code>}
          </div>
        ) : <em>None declared</em>}
      </div>
      {onDownload ? <button className="download-button" type="button" onClick={onDownload}>↓ Download ZIP</button> : null}
    </section>
  );
}
