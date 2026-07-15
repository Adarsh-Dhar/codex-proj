import { transformSync } from "@babel/core";
import { posix } from "node:path";

/**
 * Applies narrow, semantics-preserving AST repairs. Violations without a safe
 * mechanical repair stay in the validation result and stop packaging.
 */
export function mutateExtension(extension, violations) {
  if (!extension || typeof extension !== "object" || !extension.files) {
    throw new TypeError("Generated extension must contain a files object.");
  }
  if (!Array.isArray(violations)) {
    throw new TypeError("violations must be an array.");
  }

  const affectedFiles = new Set(
    violations.filter(({ rule, fixable }) => rule === "mv2-browser-action" && fixable).map(({ filename }) => filename)
  );
  const files = { ...extension.files };
  const mutations = [];

  for (const filename of affectedFiles) {
    const source = files[filename];
    if (typeof source !== "string") continue;
    const result = transformSync(source, {
      filename,
      ast: false,
      code: true,
      comments: true,
      compact: false,
      configFile: false,
      babelrc: false,
      plugins: [
        () => ({
          visitor: {
            MemberExpression(path) {
              const { node } = path;
              const isChromeBrowserAction =
                node.object.type === "Identifier" &&
                node.object.name === "chrome" &&
                ((!node.computed && node.property.type === "Identifier" && node.property.name === "browserAction") ||
                  (node.computed && node.property.type === "StringLiteral" && node.property.value === "browserAction"));

              if (isChromeBrowserAction) {
                node.computed = false;
                node.property = { type: "Identifier", name: "action" };
              }
            }
          }
        })
      ]
    });
    if (!result?.code) throw new Error(`Unable to mutate ${filename}.`);
    files[filename] = `${result.code}\n`;
    mutations.push({ filename, rule: "mv2-browser-action", message: "Replaced chrome.browserAction with chrome.action." });
  }

  return { ...extension, files, mutations };
}

/** Rewrites version-pinned bare imports to the local vendor/ source files. */
export function rewriteExternalImports(extension, vendorMap) {
  if (!(vendorMap instanceof Map)) throw new TypeError("vendorMap must be a Map.");
  const files = { ...extension.files };
  const vendorRewrites = [];

  for (const [filename, source] of Object.entries(files)) {
    if (!filename.endsWith(".js") || typeof source !== "string") continue;
    const result = transformSync(source, {
      filename,
      ast: false,
      code: true,
      comments: true,
      compact: false,
      configFile: false,
      babelrc: false,
      plugins: [
        () => ({
          visitor: {
            ImportDeclaration(path) { rewriteSource(path.node.source, filename, vendorMap, vendorRewrites); },
            ExportNamedDeclaration(path) {
              if (path.node.source) rewriteSource(path.node.source, filename, vendorMap, vendorRewrites);
            },
            ExportAllDeclaration(path) { rewriteSource(path.node.source, filename, vendorMap, vendorRewrites); }
          }
        })
      ]
    });
    if (!result?.code) throw new Error(`Unable to rewrite imports in ${filename}.`);
    files[filename] = `${result.code}\n`;
  }
  return { ...extension, files, vendorRewrites };
}

function rewriteSource(sourceNode, filename, vendorMap, vendorRewrites) {
  const vendorPath = vendorMap.get(sourceNode.value);
  if (!vendorPath) return;
  const fromDirectory = posix.dirname(filename);
  let localPath = posix.relative(fromDirectory === "." ? "" : fromDirectory, vendorPath);
  if (!localPath.startsWith(".")) localPath = `./${localPath}`;
  vendorRewrites.push({ filename, from: sourceNode.value, to: localPath });
  sourceNode.value = localPath;
}
