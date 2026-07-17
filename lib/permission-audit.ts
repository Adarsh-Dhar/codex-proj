import type { LogEntry, PermissionAudit } from "./types";

const API_NAMESPACES: Record<string, string[]> = {
  activeTab: ["chrome.tabs."],
  alarms: ["chrome.alarms."],
  notifications: ["chrome.notifications."],
  scripting: ["chrome.scripting."],
  storage: ["chrome.storage."],
  tabs: ["chrome.tabs."],
};

export function auditPermissions(manifest: Record<string, unknown>, entries: LogEntry[]): PermissionAudit {
  const permissions = [
    ...(stringList(manifest.permissions)),
    ...(stringList(manifest.host_permissions)),
  ];

  return permissions.map((permission) => ({
    permission,
    justified: isHostPermission(permission)
      ? entries.some((entry) => entry.api.includes("fetch") && entry.detail.includes(hostFromPattern(permission)))
      : (API_NAMESPACES[permission] ?? [`chrome.${permission}.`]).some((namespace) =>
          entries.some((entry) => entry.api.startsWith(namespace))),
  }));
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
