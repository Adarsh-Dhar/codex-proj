const COSTS: Record<string, string> = {
  activeTab: "Can access the current tab after you click the extension.",
  alarms: "Can schedule periodic background work.",
  notifications: "Can show desktop notifications.",
  scripting: "Can inject scripts into pages after permission is granted.",
  storage: "Can save extension settings and state locally.",
  tabs: "Can see the titles and URLs of your open tabs.",
  "<all_urls>": "Can read and modify every website you visit.",
};

export default function PermissionCostPanel({ manifest }: { manifest: Record<string, unknown> }) {
  const permissions = [
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
    ...(Array.isArray(manifest.host_permissions) ? manifest.host_permissions : []),
  ].filter((permission): permission is string => typeof permission === "string");
  if (!permissions.length) return null;
  return <section className="permission-cost" aria-label="Permission explanations">
    <div className="section-heading"><span>Permission impact</span></div>
    {permissions.map((permission) => <p key={permission}><code>{permission}</code>{COSTS[permission] ?? "Allows access needed by this extension feature."}</p>)}
  </section>;
}
