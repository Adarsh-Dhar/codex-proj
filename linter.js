import { ESLint } from "eslint";

const EXTENSION_GLOBALS = {
  chrome: "readonly",
  browser: "readonly",
  console: "readonly",
  document: "readonly",
  window: "readonly",
  navigator: "readonly",
  MutationObserver: "readonly",
  URL: "readonly",
  fetch: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  WebSocket: "readonly",
  EventSource: "readonly"
};

/** Lints generated application files using ESLint's programmatic API. */
export async function lintExtension(extension) {
  if (!extension || typeof extension !== "object" || !extension.files) {
    throw new TypeError("Generated extension must contain a files object.");
  }

  const eslint = new ESLint({
    overrideConfigFile: true,
    allowInlineConfig: false,
    overrideConfig: {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        globals: EXTENSION_GLOBALS
      },
      rules: {
        "no-undef": "error",
        "no-unused-vars": "warn",
        "no-unreachable": "error",
        "no-dupe-keys": "error",
        "no-const-assign": "error",
        "no-cond-assign": "error"
      }
    }
  });

  const violations = [];
  for (const [filename, source] of Object.entries(extension.files)) {
    if (!filename.endsWith(".js") || filename.startsWith("vendor/") || filename.startsWith("scaffold/")) continue;
    const [result] = await eslint.lintText(source, { filePath: filename });
    for (const message of result.messages) {
      if (message.severity !== 2) continue;
      violations.push({
        rule: `eslint-${message.ruleId ?? "parse-error"}`,
        severity: "error",
        message: message.message,
        filename,
        loc: { start: { line: message.line ?? 0, column: message.column ?? 0 } },
        fixable: false
      });
    }
  }
  return violations;
}
