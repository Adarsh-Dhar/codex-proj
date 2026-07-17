import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import JSZip from "jszip";
import { testExtension } from "../../../e2e-tester.js";

export const runtime = "nodejs";

let busy = false;

export async function POST(request: Request) {
  if (busy) return Response.json({ error: "A real browser run is already in progress." }, { status: 429 });
  busy = true;
  let tempDir: string | undefined;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const action = formData.get("action");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) {
      return Response.json({ error: "Upload a Chrome extension ZIP file." }, { status: 400 });
    }
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    tempDir = await mkdtemp(join(tmpdir(), "extension-sandbox-real-"));
    const unpackedDir = join(tempDir, "extension");
    await unpackZip(zip, unpackedDir);
    const screenshotPath = join(tempDir, "preview.png");
    const result = await testExtension(unpackedDir, {
      screenshotPath,
      clickSelector: action === "click-primary" ? "button:visible:enabled" : undefined,
    });
    if (result.status !== "passed") return Response.json({ error: result.message ?? result.reason ?? "The real browser test did not complete." }, { status: 422 });
    const screenshot = await readFile(screenshotPath);
    return Response.json({ screenshotDataUrl: `data:image/png;base64,${screenshot.toString("base64")}`, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Real browser run failed." }, { status: 500 });
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    busy = false;
  }
}

async function unpackZip(zip: JSZip, destination: string) {
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const target = resolve(destination, entry.name);
    if (relative(destination, target).startsWith("..")) throw new Error("ZIP contains an unsafe file path.");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entry.async("nodebuffer"));
  }
}
