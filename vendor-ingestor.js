import { createHash } from "node:crypto";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const ESM_SH_ORIGIN = "https://esm.sh";
const MAX_VENDOR_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const vendorCache = new Map();

/**
 * Downloads each unique, version-pinned npm dependency once, stores it under
 * the extension's virtual vendor/ directory, and records its integrity hash.
 */
export async function ingestDependencies(extension, dependencies, options = {}) {
  if (!extension || typeof extension !== "object" || !extension.files) {
    throw new TypeError("Generated extension must contain a files object.");
  }
  if (!Array.isArray(dependencies)) {
    throw new TypeError("dependencies must be an array.");
  }

  const files = { ...extension.files };
  const vendorMap = new Map();
  const vendored = [];

  for (const { specifier } of dependencies) {
    assertPinnedNpmSpecifier(specifier);
    const vendorPath = vendorPathFor(specifier);
    const code = typeof files[vendorPath] === "string"
      ? files[vendorPath]
      : await getOrDownloadBundle(specifier, options.fetcher ?? fetch);

    assertSelfContainedModule(code, vendorPath);
    files[vendorPath] = code;
    vendorMap.set(specifier, vendorPath);
    vendored.push({
      specifier,
      path: vendorPath,
      sha256: createHash("sha256").update(code).digest("hex")
    });
  }

  if (vendored.length > 0) {
    files["vendor-lock.json"] = `${JSON.stringify({
      provider: "esm.sh",
      dependencies: vendored
    }, null, 2)}\n`;
  }

  return { ...extension, files, vendorMap, vendored };
}

function getOrDownloadBundle(specifier, fetcher) {
  const cacheKey = `esm.sh:${specifier}`;
  if (!vendorCache.has(cacheKey)) {
    const request = downloadBundle(specifier, fetcher);
    vendorCache.set(cacheKey, request);
    request.catch(() => vendorCache.delete(cacheKey));
  }
  return vendorCache.get(cacheKey);
}

async function downloadBundle(specifier, fetcher) {
  let url = `${ESM_SH_ORIGIN}/${specifier}?standalone&target=es2022`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = await fetchText(url, fetcher);
    const wrapperTarget = findBundleWrapperTarget(code);
    if (!wrapperTarget) return code;
    url = new URL(wrapperTarget, ESM_SH_ORIGIN).toString();
  }
  throw new Error(`esm.sh bundle indirection exceeded the allowed limit for ${specifier}.`);
}

async function fetchText(url, fetcher) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/javascript, text/javascript" }
    });
    if (!response?.ok) throw new Error(`Vendor download failed with HTTP ${response?.status ?? "unknown"}.`);
    const code = await response.text();
    if (!code || Buffer.byteLength(code, "utf8") > MAX_VENDOR_BYTES) {
      throw new Error(`Vendor bundle exceeds the ${MAX_VENDOR_BYTES} byte limit.`);
    }
    return code;
  } finally {
    clearTimeout(timeout);
  }
}

function findBundleWrapperTarget(code) {
  if (code.length > 4096) return null;
  const targets = [...code.matchAll(/\bfrom\s*["'](\/[^"']+\.bundle\.[cm]?js)["']/g)].map((match) => match[1]);
  return new Set(targets).size === 1 ? targets[0] : null;
}

function assertSelfContainedModule(code, filename) {
  let ast;
  try {
    ast = parse(code, { sourceType: "module" });
  } catch (error) {
    throw new Error(`Downloaded vendor module ${filename} is not valid JavaScript: ${error.message}`);
  }
  const unresolved = [];
  traverse(ast, {
    ImportDeclaration(path) { unresolved.push(path.node.source.value); },
    ExportNamedDeclaration(path) {
      if (path.node.source) unresolved.push(path.node.source.value);
    },
    ExportAllDeclaration(path) { unresolved.push(path.node.source.value); },
    ImportExpression() { unresolved.push("dynamic import"); },
    CallExpression(path) {
      if (path.node.callee.type === "Import") unresolved.push("dynamic import");
    }
  });
  if (unresolved.length > 0) {
    throw new Error(`Downloaded vendor module ${filename} is not self-contained: ${[...new Set(unresolved)].join(", ")}.`);
  }
}

function assertPinnedNpmSpecifier(specifier) {
  const match = /^(?:@([a-z0-9][a-z0-9._-]*)\/)?([a-z0-9][a-z0-9._-]*)(?:@([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?))?(\/[-a-zA-Z0-9._/]+)?$/.exec(specifier);
  if (!match || !match[3]) {
    throw new Error(`Vendor dependency must be an exact version-pinned npm specifier: ${specifier}`);
  }
}

function vendorPathFor(specifier) {
  const readableName = specifier.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const fingerprint = createHash("sha256").update(specifier).digest("hex").slice(0, 12);
  return `vendor/${readableName}-${fingerprint}.js`;
}
