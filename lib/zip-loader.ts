import JSZip from "jszip";
import type { LoadedExtension, Surface } from "./types";

type ZipEntry = { name: string; dir: boolean };

export async function loadZip(file: File): Promise<LoadedExtension> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files) as ZipEntry[];
  const manifests = entries.filter((entry) => !entry.dir && entry.name.endsWith("manifest.json"));
  const manifestEntry = manifests.find((entry) => entry.name === "manifest.json") ?? manifests[0];

  if (!manifestEntry) throw new Error("No manifest.json was found in this ZIP.");

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await zip.file(manifestEntry.name)!.async("text"));
  } catch {
    throw new Error("The manifest.json file is not valid JSON.");
  }

  return {
    zip,
    manifest,
    baseDir: manifestEntry.name.slice(0, -"manifest.json".length),
    fileName: file.name,
  };
}

export function getSurfaces(manifest: Record<string, unknown>): Surface[] {
  const surfaces: Surface[] = [];
  const action = (manifest.action ?? manifest.browser_action) as Record<string, unknown> | undefined;
  const options = manifest.options_ui as Record<string, unknown> | undefined;
  const sidePanel = manifest.side_panel as Record<string, unknown> | undefined;
  const chromeUrlOverrides = manifest.chrome_url_overrides as Record<string, unknown> | undefined;

  addSurface(surfaces, "popup", "Popup", stringValue(action?.default_popup));
  addSurface(surfaces, "options", "Options", stringValue(options?.page));
  addSurface(surfaces, "devtools", "DevTools", stringValue(manifest.devtools_page));
  addSurface(surfaces, "sidepanel", "Side panel", stringValue(sidePanel?.default_path));
  addSurface(surfaces, "newtab", "New tab", stringValue(chromeUrlOverrides?.newtab));
  return surfaces;
}

export function resolvePath(baseDir: string, fromPath: string, request: string): string {
  if (/^(data:|https?:|chrome-extension:|#)/i.test(request)) return request;
  const withoutHash = request.split(/[?#]/)[0];
  const sourceDir = fromPath.slice(0, fromPath.lastIndexOf("/") + 1);
  const parts = `${baseDir}${sourceDir}${withoutHash}`.split("/");
  const normalised: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalised.pop();
    else normalised.push(part);
  }
  return normalised.join("/");
}

function addSurface(surfaces: Surface[], key: Surface["key"], label: string, path?: string) {
  if (path) surfaces.push({ key, label, path });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
