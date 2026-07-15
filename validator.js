import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const FORBIDDEN_HOST_PATTERNS = new Set(["<all_urls>", "*://*/*", "http://*/*", "https://*/*", "https://*/"]);

/** Returns deterministic compliance errors for a generated MV3 manifest. */
export function validateManifest(manifest) {
  const violations = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return [manifestViolation("manifest-shape", "manifest.json must be an object.")];
  }
  if (manifest.manifest_version !== 3) {
    violations.push(manifestViolation("manifest-version", "Only manifest_version: 3 is allowed."));
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    violations.push(manifestViolation("manifest-name", "A non-empty manifest name is required."));
  }
  if (typeof manifest.version !== "string" || !/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifest.version)) {
    violations.push(manifestViolation("manifest-version-format", "Version must contain one to four numeric components."));
  }

  for (const field of ["host_permissions", "optional_host_permissions"]) {
    const hosts = manifest[field];
    if (hosts === undefined) continue;
    if (!Array.isArray(hosts)) {
      violations.push(manifestViolation(`${field}-type`, `${field} must be an array.`));
      continue;
    }
    if (new Set(hosts).size !== hosts.length) {
      violations.push(manifestViolation(`duplicate-${field}`, `${field} must not contain duplicates.`));
    }
    for (const host of hosts) {
      if (typeof host !== "string" || isForbiddenHost(host)) {
        violations.push(manifestViolation("broad-host-permission", `Disallowed host permission: ${String(host)}.`));
      }
    }
  }

  for (const script of manifest.content_scripts ?? []) {
    validateMatchPatterns(script?.matches, "content_scripts.matches", violations);
  }
  for (const resource of manifest.web_accessible_resources ?? []) {
    validateMatchPatterns(resource?.matches, "web_accessible_resources.matches", violations);
  }

  if (manifest.declarative_net_request && !manifest.permissions?.includes("declarativeNetRequest")) {
    violations.push(manifestViolation("dnr-permission", "declarative_net_request requires the declarativeNetRequest permission."));
  }
  if (manifest.permissions?.includes("webRequestBlocking")) {
    violations.push(manifestViolation("mv2-webrequest-blocking", "webRequestBlocking is not permitted for a regular MV3 extension."));
  }
  return violations;
}

/** Throws when a manifest fails deterministic safety validation. */
export function assertManifestSafe(manifest) {
  const violations = validateManifest(manifest);
  if (violations.length > 0) throw createValidationError(violations);
}

/** Analyses JavaScript source without executing it. */
export function validateJavaScript(source, filename = "unknown.js") {
  if (typeof source !== "string") {
    throw new TypeError(`Expected JavaScript source for ${filename} to be a string.`);
  }

  let ast;
  try {
    ast = parse(source, {
      sourceType: "unambiguous",
      plugins: ["jsx", "typescript"],
      errorRecovery: false
    });
  } catch (error) {
    return [codeViolation("javascript-syntax", `Unable to parse ${filename}: ${error.message}`, filename, null)];
  }

  const violations = [];
  const report = (rule, message, node, fixable = false) => {
    violations.push(codeViolation(rule, message, filename, node.loc ?? null, fixable));
  };

  traverse(ast, {
    MemberExpression(path) {
      const chain = memberChain(path.node);
      if (matchesChain(chain, ["chrome", "browserAction"])) {
        report("mv2-browser-action", "chrome.browserAction is deprecated in Manifest V3; use chrome.action instead.", path.node, true);
      }
      if (matchesChain(chain, ["chrome", "webRequest"])) {
        report("mv2-webrequest", "chrome.webRequest blocking logic must be replaced with declarativeNetRequest.", path.node);
      }
    },
    CallExpression(path) {
      const { node } = path;
      const chain = memberChain(node.callee);
      if (node.callee.type === "Identifier" && node.callee.name === "eval") {
        report("rce-eval", "eval() is forbidden in a Chrome Web Store extension.", node);
      }
      if (node.callee.type === "Identifier" && ["setInterval", "setTimeout"].includes(node.callee.name) && isBackgroundFile(filename)) {
        report("background-active-loop", `${node.callee.name}() in a service worker is not lifecycle-safe; use chrome.alarms and persisted timestamps.`, node);
      }
      if (node.callee.type === "Import") {
        const sourceNode = node.arguments[0];
        if (sourceNode?.type !== "StringLiteral" || isRemoteUrl(sourceNode.value)) {
          report("rce-dynamic-import", "Dynamic or remote imports are forbidden; bundle dependencies locally.", node);
        }
      }
      if (matchesChain(chain, ["document", "createElement"]) && isStringArgument(node.arguments[0], "script")) {
        report("rce-dynamic-script", "Creating script elements dynamically is forbidden; bundle the dependency locally.", node);
      }
      if (matchesChain(chain, ["chrome", "runtime", "onMessage", "addListener"])) {
        const listener = node.arguments[0];
        if (isAsyncListenerWithoutKeepAlive(listener)) {
          report("message-channel-closed", "Async chrome.runtime.onMessage handlers must return true to keep the response channel open.", node);
        }
      }
    },
    NewExpression(path) {
      if (path.node.callee.type === "Identifier" && path.node.callee.name === "Function") {
        report("rce-function-constructor", "new Function() is forbidden in a Chrome Web Store extension.", path.node);
      }
    },
    ImportDeclaration(path) {
      if (isRemoteUrl(path.node.source.value)) {
        report("rce-remote-import", "Remote JavaScript imports are forbidden; bundle dependencies locally.", path.node);
      }
    },
    ImportExpression(path) {
      const sourceNode = path.node.source;
      if (sourceNode.type !== "StringLiteral" || isRemoteUrl(sourceNode.value)) {
        report("rce-dynamic-import", "Dynamic or remote imports are forbidden; bundle dependencies locally.", path.node);
      }
    },
    AssignmentExpression(path) {
      const { left, right } = path.node;
      if (isSrcAssignment(left) && right.type === "StringLiteral" && isRemoteUrl(right.value)) {
        report("rce-remote-script-src", "Remote script URLs are forbidden; bundle dependencies locally.", path.node);
      }
    }
  });

  return deduplicateViolations(violations);
}

/** Validates the manifest, referenced assets, DNR rules, and every JS file. */
export function validateExtension(extension) {
  if (!extension || typeof extension !== "object" || !extension.files || typeof extension.files !== "object") {
    throw new TypeError("Generated extension must contain a files object.");
  }

  const manifestSource = extension.files["manifest.json"];
  if (typeof manifestSource !== "string") {
    return [manifestViolation("missing-manifest", "Generated extension must include manifest.json.")];
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    return [manifestViolation("manifest-json", `manifest.json is not valid JSON: ${error.message}`)];
  }

  const violations = [...validateManifest(manifest), ...validateManifestReferences(manifest, extension.files)];
  for (const [filename, source] of Object.entries(extension.files)) {
    if (filename.endsWith(".js")) violations.push(...validateJavaScript(source, filename));
  }
  violations.push(...validateDnrRules(manifest, extension.files));
  return deduplicateViolations(violations);
}

/**
 * Collects unique, version-pinned bare npm imports across every generated JS
 * source file. Local, absolute, and remote specifiers are excluded here and
 * handled by the normal validator rules instead.
 */
export function collectExternalDependencies(extension) {
  if (!extension || typeof extension !== "object" || !extension.files) {
    throw new TypeError("Generated extension must contain a files object.");
  }

  const dependencies = new Map();
  for (const [filename, source] of Object.entries(extension.files)) {
    if (!filename.endsWith(".js") || typeof source !== "string") continue;
    const ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx", "typescript"] });
    traverse(ast, {
      ImportDeclaration(path) {
        addDependency(path.node.source.value, filename, dependencies);
      },
      ExportNamedDeclaration(path) {
        if (path.node.source) addDependency(path.node.source.value, filename, dependencies);
      },
      ExportAllDeclaration(path) {
        addDependency(path.node.source.value, filename, dependencies);
      }
    });
  }
  return [...dependencies.values()];
}

function validateManifestReferences(manifest, files) {
  const requiredFiles = [];
  if (manifest.background?.service_worker) requiredFiles.push(manifest.background.service_worker);
  if (manifest.action?.default_popup) requiredFiles.push(manifest.action.default_popup);
  for (const script of manifest.content_scripts ?? []) {
    requiredFiles.push(...(script.js ?? []), ...(script.css ?? []));
  }
  for (const resource of manifest.declarative_net_request?.rule_resources ?? []) requiredFiles.push(resource.path);

  return requiredFiles
    .filter((file) => typeof file !== "string" || !Object.hasOwn(files, file))
    .map((file) => manifestViolation("missing-manifest-file", `Manifest references missing local file: ${String(file)}.`));
}

function validateDnrRules(manifest, files) {
  const resources = manifest.declarative_net_request?.rule_resources ?? [];
  if (!Array.isArray(resources)) return [manifestViolation("dnr-resources", "declarative_net_request.rule_resources must be an array.")];
  const violations = [];
  for (const resource of resources) {
    if (!resource || typeof resource.path !== "string" || typeof files[resource.path] !== "string") continue;
    let rules;
    try {
      rules = JSON.parse(files[resource.path]);
    } catch (error) {
      violations.push(codeViolation("dnr-json", `Unable to parse ${resource.path}: ${error.message}`, resource.path, null));
      continue;
    }
    if (!Array.isArray(rules)) {
      violations.push(codeViolation("dnr-schema", `${resource.path} must contain an array of rules.`, resource.path, null));
      continue;
    }
    for (const [index, rule] of rules.entries()) {
      if (!Number.isInteger(rule?.id) || rule.id < 1 || !Number.isInteger(rule?.priority) || rule.priority < 1 || typeof rule?.action?.type !== "string" || typeof rule?.condition !== "object") {
        violations.push(codeViolation("dnr-schema", `${resource.path} rule ${index + 1} requires id, priority, action.type, and condition.`, resource.path, null));
      }
    }
  }
  return violations;
}

function isAsyncListenerWithoutKeepAlive(listener) {
  if (!listener || !["ArrowFunctionExpression", "FunctionExpression"].includes(listener.type)) return false;
  let hasAwait = listener.async;
  let hasReturnTrue = false;
  traverse({ type: "File", program: { type: "Program", body: [{ type: "ExpressionStatement", expression: listener }] } }, {
    AwaitExpression() { hasAwait = true; },
    ReturnStatement(path) {
      if (path.node.argument?.type === "BooleanLiteral" && path.node.argument.value === true) hasReturnTrue = true;
    }
  });
  return hasAwait && !hasReturnTrue;
}

function memberChain(node) {
  if (node.type === "Identifier") return [node.name];
  if (node.type !== "MemberExpression") return [];
  const property = node.computed
    ? node.property.type === "StringLiteral" ? node.property.value : null
    : node.property.type === "Identifier" ? node.property.name : null;
  return property ? [...memberChain(node.object), property] : [];
}

function matchesChain(chain, prefix) {
  return prefix.every((part, index) => chain[index] === part);
}

function isBackgroundFile(filename) {
  return /(^|\/)background(?:\.|-)|service[_-]?worker/i.test(filename);
}

function isStringArgument(node, value) {
  return node?.type === "StringLiteral" && node.value.toLowerCase() === value;
}

function isSrcAssignment(node) {
  return node?.type === "MemberExpression" && !node.computed && node.property.type === "Identifier" && node.property.name === "src";
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function addDependency(specifier, filename, dependencies) {
  if (!isBarePackageSpecifier(specifier)) return;
  const entry = dependencies.get(specifier) ?? { specifier, importedBy: [] };
  if (!entry.importedBy.includes(filename)) entry.importedBy.push(filename);
  dependencies.set(specifier, entry);
}

function isBarePackageSpecifier(specifier) {
  return typeof specifier === "string" &&
    !specifier.startsWith(".") &&
    !specifier.startsWith("/") &&
    !specifier.startsWith("node:") &&
    !isRemoteUrl(specifier);
}

function isForbiddenHost(host) {
  return FORBIDDEN_HOST_PATTERNS.has(host) || /^(?:\*|https?|file):\/\/\*\/\*$/i.test(host);
}

function validateMatchPatterns(patterns, field, violations) {
  if (patterns === undefined) return;
  if (!Array.isArray(patterns)) {
    violations.push(manifestViolation(`${field}-type`, `${field} must be an array.`));
    return;
  }
  for (const pattern of patterns) {
    if (typeof pattern !== "string" || isForbiddenHost(pattern)) {
      violations.push(manifestViolation("broad-match-pattern", `Disallowed match pattern in ${field}: ${String(pattern)}.`));
    }
  }
}

function manifestViolation(rule, message) {
  return { rule, severity: "error", message, filename: "manifest.json", loc: null, fixable: false };
}

function codeViolation(rule, message, filename, loc, fixable = false) {
  return { rule, severity: "error", message, filename, loc, fixable };
}

function deduplicateViolations(violations) {
  const seen = new Set();
  return violations.filter((violation) => {
    const key = `${violation.rule}:${violation.filename}:${violation.loc?.start?.line ?? 0}:${violation.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createValidationError(violations) {
  const error = new Error(`Extension validation failed: ${violations.map(({ message }) => message).join(" ")}`);
  error.name = "ExtensionValidationError";
  error.violations = violations;
  return error;
}
