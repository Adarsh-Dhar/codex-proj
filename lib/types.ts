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
import type JSZip from "jszip";
