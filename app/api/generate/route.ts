import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { compileExtension, repairCompiledExtension } from "../../../index.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      prompt?: unknown;
      repairViolation?: { rule?: string; file?: string; detail?: string };
      previousFiles?: Record<string, string>;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return Response.json({ error: "Enter an extension prompt." }, { status: 400 });

    const compiled = body.repairViolation && body.previousFiles
      ? await repairCompiledExtension(prompt, body.previousFiles, body.repairViolation)
      : await compileExtension(prompt);
    const zipBuffer = await readFile(compiled.archivePath);
    const files = await readZipFiles(zipBuffer);
    const repairs = (compiled.mutations ?? []).map((mutation: { filename?: string; message?: string }) => ({
      file: mutation.filename ?? "extension",
      detail: mutation.message ?? "Applied a deterministic safety repair."
    }));
    return Response.json({
      manifest: compiled.manifest,
      files,
      validationReport: { violations: [], repairs },
      zipBase64: zipBuffer.toString("base64")
    });
  } catch (error) {
    const known = error as Error & { violations?: Array<{ rule?: string; filename?: string; message?: string; severity?: string }> };
    const violations = known.violations?.map((violation) => ({
      rule: violation.rule ?? "validation-error",
      file: violation.filename ?? "extension",
      detail: violation.message ?? "The extension failed a safety check.",
      severity: violation.severity === "warning" ? "warning" : "error"
    })) ?? [];
    return Response.json({ error: known.message || "Generation failed.", validationReport: { violations, repairs: [] } }, { status: 422 });
  }
}

async function readZipFiles(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files: Record<string, string> = {};
  await Promise.all(Object.values(zip.files).filter((entry) => !entry.dir).map(async (entry) => {
    files[entry.name] = await entry.async("text");
  }));
  return files;
}
