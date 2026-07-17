import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { compileExtension, repairCompiledExtension } from "../../../index.js";

export const runtime = "nodejs";

type GenerateBody = {
  prompt?: unknown;
  repairViolation?: { rule?: string; file?: string; detail?: string };
  previousFiles?: Record<string, string>;
};

/** Streams compiler stages so the UI can report real work as it happens. */
export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const body = await request.json() as GenerateBody;
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) throw new Error("Enter an extension prompt.");

        const onStage = (label: string) => send({ type: "stage", label });
        const compiled = body.repairViolation && body.previousFiles
          ? await repairCompiledExtension(prompt, body.previousFiles, body.repairViolation, { onStage })
          : await compileExtension(prompt, { onStage });
        const zipBuffer = await readFile(compiled.archivePath);
        const files = await readZipFiles(zipBuffer);
        const repairs = (compiled.mutations ?? []).map((mutation: { filename?: string; message?: string }) => ({
          file: mutation.filename ?? "extension",
          detail: mutation.message ?? "Applied a deterministic safety repair."
        }));
        send({
          type: "done",
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
        send({ type: "error", error: known.message || "Generation failed.", validationReport: { violations, repairs: [] } });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

async function readZipFiles(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files: Record<string, string> = {};
  await Promise.all(Object.values(zip.files).filter((entry) => !entry.dir).map(async (entry) => {
    files[entry.name] = await entry.async("text");
  }));
  return files;
}
