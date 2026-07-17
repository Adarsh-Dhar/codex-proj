import type { LogEntry, PermissionAudit } from "./types";

const API_NAMESPACES: Record<string, string[]> = {
  activeTab: ["chrome.tabs."],
  alarms: ["chrome.alarms."],
  bookmarks: ["chrome.bookmarks."],
  clipboardRead: ["navigator.clipboard.read", "navigator.clipboard.readText"],
  clipboardWrite: ["navigator.clipboard.write", "navigator.clipboard.writeText"],
  contextMenus: ["chrome.contextMenus."],
  cookies: ["chrome.cookies."],
  debugger: ["chrome.debugger."],
  declarativeNetRequest: ["chrome.declarativeNetRequest."],
  downloads: ["chrome.downloads."],
  history: ["chrome.history."],
  idle: ["chrome.idle."],
  identity: ["chrome.identity."],
  management: ["chrome.management."],
  notifications: ["chrome.notifications."],
  offscreen: ["chrome.offscreen."],
  permissions: ["chrome.permissions."],
  power: ["chrome.power."],
  proxy: ["chrome.proxy."],
  sessions: ["chrome.sessions."],
  scripting: ["chrome.scripting."],
  storage: ["chrome.storage."],
  tabs: ["chrome.tabs."],
  topSites: ["chrome.topSites."],
  webNavigation: ["chrome.webNavigation."],
  webRequest: ["chrome.webRequest."],
};

const NETWORK_APIS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"];

export function auditPermissions(manifest: Record<string, unknown>, entries: LogEntry[]): PermissionAudit {
  const permissions = [
    ...(stringList(manifest.permissions)),
    ...(stringList(manifest.host_permissions)),
  ];

  return permissions.map((permission) => ({
    permission,
    justified: isHostPermission(permission)
      ? hasMatchingNetworkUse(permission, entries)
      : (API_NAMESPACES[permission] ?? [`chrome.${permission}.`]).some((namespace) =>
          entries.some((entry) => entry.api.startsWith(namespace))),
  }));
}

function hasMatchingNetworkUse(permission: string, entries: LogEntry[]) {
  const networkEntries = entries.filter((entry) => NETWORK_APIS.some((api) => entry.api.includes(api)));
  if (permission === "<all_urls>") return networkEntries.length > 0;
  const host = hostFromPattern(permission);
  return networkEntries.some((entry) => entry.detail.includes(host));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isHostPermission(permission: string) {
  return permission.includes("://") || permission === "<all_urls>";
}

function hostFromPattern(permission: string) {
  return permission.replace(/^[*a-z]+:\/\//i, "").replace(/\/.*/, "").replace("*", "");
}
