import { cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { build } from "esbuild";
import JSZip from "jszip";

const SAFE_FILE_PATH = /^(?!.*(?:^|\/)\.\.?\/)[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

/** Bundles JavaScript, preserves other extension assets, and writes a sideloadable zip. */
export async function packageExtension(extension, options = {}) {
  if (!extension || typeof extension !== "object" || !extension.files) {
    throw new TypeError("Generated extension must contain a files object.");
  }

  const outputPath = resolve(options.outputPath ?? "dist/generated-extension.zip");
  const tempRoot = await mkdtemp(join(tmpdir(), "mv3-compiler-"));
  const sourceRoot = join(tempRoot, "source");
  const bundleRoot = join(tempRoot, "bundle");

  try {
    await writeSourceTree(extension.files, sourceRoot);
    const sourcePath = await retainSourceTree(sourceRoot, options);
    await buildBundle(sourceRoot, bundleRoot, extension.files);
    const unpackedPath = await retainUnpackedBundle(bundleRoot, options);
    await mkdir(dirname(outputPath), { recursive: true });
    const archive = await createZip(bundleRoot);
    await writeFile(outputPath, archive.buffer);
    return { archivePath: outputPath, sourcePath, unpackedPath, files: archive.files };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** Retains the exact pre-esbuild tree for an independently inspectable proof run. */
async function retainSourceTree(sourceRoot, options) {
  if (!options.keepSource) return null;
  const sourcePath = resolve(options.sourceOutputPath ?? "dist/generated-extension-source");
  await rm(sourcePath, { recursive: true, force: true });
  await mkdir(dirname(sourcePath), { recursive: true });
  await cp(sourceRoot, sourcePath, { recursive: true });
  return sourcePath;
}

async function retainUnpackedBundle(bundleRoot, options) {
  if (!options.keepUnpacked) return null;
  const unpackedPath = resolve(options.unpackedOutputPath ?? "dist/unpacked-extension");
  await rm(unpackedPath, { recursive: true, force: true });
  await mkdir(dirname(unpackedPath), { recursive: true });
  await cp(bundleRoot, unpackedPath, { recursive: true });
  return unpackedPath;
}

async function writeSourceTree(files, sourceRoot) {
  for (const [filename, content] of Object.entries(files)) {
    assertSafeFilePath(filename);
    if (typeof content !== "string") throw new TypeError(`File ${filename} must have string content.`);
    const destination = join(sourceRoot, filename);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
}

async function buildBundle(sourceRoot, bundleRoot, files) {
  await cp(sourceRoot, bundleRoot, { recursive: true });
  for (const filename of Object.keys(files).filter((name) =>
    name.endsWith(".js") && !name.startsWith("vendor/") && !name.startsWith("scaffold/")
  )) {
    const source = join(sourceRoot, filename);
    const output = join(bundleRoot, filename);
    await mkdir(dirname(output), { recursive: true });
    await build({
      entryPoints: [source],
      outfile: output,
      bundle: true,
      minify: true,
      platform: "browser",
      format: "iife",
      target: ["chrome114"],
      legalComments: "none",
      logLevel: "silent"
    });
  }
  // Vendor and reviewed scaffold modules are compiler inputs. esbuild folds
  // them into importing application files, so retaining either directory
  // would leave dead standalone copies in the final extension.
  await rm(join(bundleRoot, "vendor"), { recursive: true, force: true });
  await rm(join(bundleRoot, "scaffold"), { recursive: true, force: true });
}

async function createZip(directory) {
  const zip = new JSZip();
  const files = [];
  for await (const filePath of walkFiles(directory)) {
    const archiveName = relative(directory, filePath).split(sep).join("/");
    files.push(archiveName);
    zip.file(archiveName, await readFile(filePath));
  }
  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }),
    files: files.sort()
  };
}

async function* walkFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) yield* walkFiles(entryPath);
    if (entry.isFile()) yield entryPath;
  }
}

function assertSafeFilePath(filePath) {
  if (typeof filePath !== "string" || !SAFE_FILE_PATH.test(filePath)) {
    throw new Error(`Unsafe generated file path: ${String(filePath)}`);
  }
}
