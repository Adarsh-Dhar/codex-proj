import { transformSync } from "@babel/core";

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
