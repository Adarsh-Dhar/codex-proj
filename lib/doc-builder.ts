import type JSZip from "jszip";
import { MOCK_SHIM_SOURCE } from "./mock-shim";
import { resolvePath } from "./zip-loader";
import type { Surface } from "./types";

export async function buildSandboxDocument(
  zip: JSZip,
  manifest: Record<string, unknown>,
  baseDir: string,
  surface: Surface,
): Promise<string> {
  const entryPath = resolvePath(baseDir, "", surface.path);
  const file = zip.file(entryPath);
  if (!file) throw new Error(`Could not find ${surface.path} in this ZIP.`);

  const parser = new DOMParser();
  const document = parser.parseFromString(await file.async("text"), "text/html");
  await inlineStyles(document, zip, baseDir, surface.path);
  await inlineScripts(document, zip, baseDir, surface.path);
  await inlineImages(document, zip, baseDir, surface.path);

  const shim = document.createElement("script");
  shim.textContent = MOCK_SHIM_SOURCE;
  document.head.prepend(shim);
  await injectBackgroundScript(document, zip, manifest, baseDir, shim);

  const baseStyle = document.createElement("style");
  baseStyle.textContent = `:root { color-scheme: light; } body { min-height: 100vh; }`;
  document.head.append(baseStyle);

  return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
}

async function injectBackgroundScript(
  document: Document,
  zip: JSZip,
  manifest: Record<string, unknown>,
  baseDir: string,
  shim: HTMLScriptElement,
) {
  const background = manifest.background as Record<string, unknown> | undefined;
  const serviceWorker = typeof background?.service_worker === "string" ? background.service_worker : undefined;
  if (!serviceWorker) return;

  const file = zip.file(resolvePath(baseDir, "", serviceWorker));
  if (!file) return;

  const backgroundScript = document.createElement("script");
  if (background?.type === "module") backgroundScript.type = "module";
  backgroundScript.textContent = await file.async("text");
  document.head.insertBefore(backgroundScript, shim.nextSibling);
}

async function inlineStyles(document: Document, zip: JSZip, baseDir: string, fromPath: string) {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')];
  await Promise.all(links.map(async (link) => {
    const file = zip.file(resolvePath(baseDir, fromPath, link.getAttribute("href")!));
    if (!file) return;
    const style = document.createElement("style");
    style.textContent = await file.async("text");
    link.replaceWith(style);
  }));
}

async function inlineScripts(document: Document, zip: JSZip, baseDir: string, fromPath: string) {
  const scripts = [...document.querySelectorAll<HTMLScriptElement>("script[src]")];
  await Promise.all(scripts.map(async (script) => {
    const file = zip.file(resolvePath(baseDir, fromPath, script.getAttribute("src")!));
    if (!file) return;
    const replacement = document.createElement("script");
    if (script.type) replacement.type = script.type;
    replacement.textContent = await file.async("text");
    script.replaceWith(replacement);
  }));
}

async function inlineImages(document: Document, zip: JSZip, baseDir: string, fromPath: string) {
  const images = [...document.querySelectorAll<HTMLImageElement>("img[src]")];
  await Promise.all(images.map(async (image) => {
    const source = image.getAttribute("src")!;
    const file = zip.file(resolvePath(baseDir, fromPath, source));
    if (!file) return;
    const bytes = await file.async("base64");
    const extension = source.split(".").pop()?.toLowerCase() || "png";
    const mime = extension === "svg" ? "image/svg+xml" : `image/${extension === "jpg" ? "jpeg" : extension}`;
    image.src = `data:${mime};base64,${bytes}`;
  }));
}
