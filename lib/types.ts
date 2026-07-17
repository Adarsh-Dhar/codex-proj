export type LogEntry = {
  api: string;
  detail: string;
  isError?: boolean;
  time: number;
};

export type Surface = {
  key: "popup" | "options" | "devtools" | "sidepanel" | "newtab";
  label: string;
  path: string;
};

export type LoadedExtension = {
  zip: JSZip;
  manifest: Record<string, unknown>;
  baseDir: string;
  fileName: string;
};

export type ValidationIssue = {
  rule: string;
  file: string;
  detail: string;
  severity: "error" | "warning" | "info";
};

export type ValidationReport = {
  violations: ValidationIssue[];
  repairs: Array<{ file: string; detail: string }>;
};

export type PermissionAudit = Array<{ permission: string; justified: boolean }>;
import type JSZip from "jszip";
