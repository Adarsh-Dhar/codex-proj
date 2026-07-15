import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const BROAD_HOST_PERMISSIONS = new Set(["<all_urls>", "*://*/*", "http://*/*", "https://*/*", "https://*/"]);

/**
 * Replaces broad host_permissions with the precise HTTPS/HTTP origins found in
 * static network calls. Dynamic targets deliberately stop the build because a
 * deterministic scanner cannot prove their required host access.
 */
export function optimizeHostPermissions(extension) {
  if (!extension || typeof extension !== "object" || !extension.files) {
    throw new TypeError("Generated extension must contain a files object.");
  }
  const manifestSource = extension.files["manifest.json"];
  if (typeof manifestSource !== "string") {
    throw new Error("Generated extension must include manifest.json.");
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    throw new Error(`Unable to optimize invalid manifest.json: ${error.message}`);
  }

  const hostPermissions = manifest.host_permissions;
  const broadPermissions = Array.isArray(hostPermissions)
    ? hostPermissions.filter((permission) => BROAD_HOST_PERMISSIONS.has(permission))
    : [];

  // Chrome host permissions are match patterns, not request URLs. Normalise a
  // model-produced path such as https://api.example.com/status to the smallest
  // valid permission covering that origin: https://api.example.com/*.
  const normalizedExistingHosts = Array.isArray(hostPermissions)
    ? hostPermissions.map(normalizeHostPermission)
    : hostPermissions;
  const normalizedChanged = Array.isArray(hostPermissions) &&
    normalizedExistingHosts.some((host, index) => host !== hostPermissions[index]);

  if (broadPermissions.length === 0) {
    if (!normalizedChanged) {
      return { ...extension, permissionOptimization: { changed: false, reason: "already-scoped" }, permissionViolations: [] };
    }
    manifest.host_permissions = normalizedExistingHosts;
    return {
      ...extension,
      files: { ...extension.files, "manifest.json": `${JSON.stringify(manifest, null, 2)}\n` },
      permissionOptimization: {
        changed: true,
        removed: [],
        hostPermissions: normalizedExistingHosts,
        reason: "normalized-match-pattern"
      },
      permissionViolations: []
    };
  }

  const { origins, dynamicTargets, parseErrors } = discoverNetworkOrigins(extension.files);
  if (parseErrors.length > 0 || dynamicTargets.length > 0) {
    return {
      ...extension,
      permissionOptimization: { changed: false, reason: "dynamic-or-unparseable-network-target" },
      permissionViolations: [
        ...parseErrors.map(({ filename, message }) => permissionViolation("permission-optimizer-syntax", message, filename)),
        ...dynamicTargets.map(({ filename, loc }) => permissionViolation(
          "permission-dynamic-network-target",
          "Dynamic network target prevents safe host-permission downscoping.",
          filename,
          loc
        ))
      ]
    };
  }

  const minimizedHosts = [...origins].sort();
  manifest.host_permissions = minimizedHosts;
  const files = {
    ...extension.files,
    "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`
  };
  return {
    ...extension,
    files,
    permissionOptimization: {
      changed: true,
      removed: broadPermissions,
      hostPermissions: minimizedHosts
    },
    permissionViolations: []
  };
}

function discoverNetworkOrigins(files) {
  const origins = new Set();
  const dynamicTargets = [];
  const parseErrors = [];

  for (const [filename, source] of Object.entries(files)) {
    if (!filename.endsWith(".js") || typeof source !== "string") continue;
    let ast;
    try {
      ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx", "typescript"] });
    } catch (error) {
      parseErrors.push({ filename, message: `Unable to parse ${filename}: ${error.message}` });
      continue;
    }

    traverse(ast, {
      CallExpression(path) {
        const urlArgumentIndex = networkUrlArgumentIndex(path.node);
        if (urlArgumentIndex === null) return;
        const target = path.node.arguments[urlArgumentIndex];
        const literalUrl = staticUrlValue(target);
        if (!literalUrl) {
          dynamicTargets.push({ filename, loc: target?.loc ?? path.node.loc ?? null });
          return;
        }
        const originPattern = chromeMatchPatternFor(literalUrl);
        if (originPattern) origins.add(originPattern);
      },
      NewExpression(path) {
        if (!isIdentifier(path.node.callee, "WebSocket") && !isIdentifier(path.node.callee, "EventSource")) return;
        const literalUrl = staticUrlValue(path.node.arguments[0]);
        if (!literalUrl) {
          dynamicTargets.push({ filename, loc: path.node.arguments[0]?.loc ?? path.node.loc ?? null });
          return;
        }
        const originPattern = chromeMatchPatternFor(literalUrl);
        if (originPattern) origins.add(originPattern);
      }
    });
  }
  return { origins, dynamicTargets, parseErrors };
}

function networkUrlArgumentIndex(node) {
  if (isIdentifier(node.callee, "fetch") || isMember(node.callee, "globalThis", "fetch")) return 0;
  if (isMember(node.callee, "XMLHttpRequest", "open")) return 1;
  return null;
}

function staticUrlValue(node) {
  if (node?.type === "StringLiteral") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function chromeMatchPatternFor(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

function normalizeHostPermission(value) {
  if (typeof value !== "string") return value;
  const match = /^(\*|https?):\/\/([^/]+)(?:\/.*)?$/i.exec(value);
  if (!match) return value;
  return `${match[1].toLowerCase()}://${match[2]}/*`;
}

function isIdentifier(node, name) {
  return node?.type === "Identifier" && node.name === name;
}

function isMember(node, objectName, propertyName) {
  return node?.type === "MemberExpression" &&
    !node.computed &&
    isIdentifier(node.object, objectName) &&
    isIdentifier(node.property, propertyName);
}

function permissionViolation(rule, message, filename, loc = null) {
  return { rule, severity: "error", message, filename, loc, fixable: false };
}
