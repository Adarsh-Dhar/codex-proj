import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateExtension, generateManifest, repairExtension } from "./ai-orchestrator.js";
import { lintExtension } from "./linter.js";
import { mutateExtension, rewriteExternalImports } from "./mutator.js";
import { packageExtension } from "./packager.js";
import { optimizeHostPermissions } from "./permission-optimizer.js";
import { resolveScaffolds } from "./scaffolder.js";
import { collectExternalDependencies, inspectScaffoldUsage, validateExtension } from "./validator.js";
import { ingestDependencies } from "./vendor-ingestor.js";

/** Runs generation, deterministic checks, one lint repair, vendoring, and packaging. */
export async function compileExtension(description, options = {}) {
  if (typeof description !== "string" || !description.trim()) {
    throw new TypeError("A non-empty extension description is required.");
  }

  reportStage(options, "Generating extension files");
  const generated = await generateExtension(description, options);
  reportStage(options, "Resolving approved scaffolds");
  let extension = await resolveScaffolds(generated);
  const mutations = [];
  reportStage(options, "Applying security checks and permission downscoping");
  extension = applySecurityPipeline(extension, mutations);

  reportStage(options, "Linting extension code");
  const initialLintViolations = await lintExtension(extension);
  let lintRepair = { attempted: false, violations: 0 };
  if (initialLintViolations.length > 0) {
    reportStage(options, "Repairing lint findings");
    const repaired = await repairExtension(description, extension, initialLintViolations, options);
    const merged = mergeRepairedExtension(extension, repaired);
    extension = await resolveScaffolds(merged, extension.requestedScaffolds);
    extension = applySecurityPipeline(extension, mutations);
    reportStage(options, "Rechecking repaired code");
    const remainingLintViolations = await lintExtension(extension);
    throwIfViolations(remainingLintViolations, mutations);
    lintRepair = { attempted: true, violations: initialLintViolations.length };
  }

  reportStage(options, "Vendoring approved dependencies");
  const dependencies = collectExternalDependencies(extension);
  const ingested = await ingestDependencies(extension, dependencies, options);
  extension = rewriteExternalImports(ingested, ingested.vendorMap);
  reportStage(options, "Validating the final extension");
  const finalViolations = validateExtension(extension);
  const unresolvedDependencies = collectExternalDependencies(extension);
  if (unresolvedDependencies.length > 0) {
    finalViolations.push(...unresolvedDependencies.map(({ specifier }) => ({
      rule: "unresolved-vendor-import",
      severity: "error",
      message: `Unresolved external dependency after vendor rewrite: ${specifier}.`,
      filename: "vendor",
      loc: null,
      fixable: false
    })));
  }
  throwIfViolations(finalViolations, mutations);
  throwIfViolations(await lintExtension(extension), mutations);
  const scaffoldUsage = inspectScaffoldUsage(extension);

  reportStage(options, "Bundling extension ZIP");
  const packaged = await packageExtension(extension, {
    ...options,
    keepUnpacked: options.keepUnpacked || options.runE2E
  });
  const e2e = options.runE2E && packaged.unpackedPath
    ? await runE2E(packaged.unpackedPath, options)
    : null;

  return {
    archivePath: packaged.archivePath,
    sourcePath: packaged.sourcePath,
    unpackedPath: packaged.unpackedPath,
    files: packaged.files,
    mutations,
    permissionOptimization: extension.permissionOptimization,
    lintRepair,
    e2e,
    vendorDependencies: ingested.vendored,
    vendorRewrites: extension.vendorRewrites,
    scaffolds: extension.trustedScaffolds,
    scaffoldUsage,
    manifest: JSON.parse(extension.files["manifest.json"])
  };
}

function applySecurityPipeline(extension, mutations) {
  const initialViolations = validateExtension(extension);
  const mutated = mutateExtension(extension, initialViolations);
  mutations.push(...mutated.mutations);
  const permissionOptimized = optimizeHostPermissions(mutated);
  throwIfViolations([
    ...validateExtension(permissionOptimized),
    ...permissionOptimized.permissionViolations
  ], mutations);
  return permissionOptimized;
}

function mergeRepairedExtension(original, repaired) {
  const preservedFiles = Object.fromEntries(
    Object.entries(original.files).filter(([filename]) => filename.startsWith("scaffold/"))
  );
  return {
    ...original,
    ...repaired,
    description: original.description,
    requestedScaffolds: original.requestedScaffolds,
    files: { ...original.files, ...repaired.files, ...preservedFiles }
  };
}

async function runE2E(unpackedPath, options) {
  try {
    const { testExtension } = await import("./e2e-tester.js");
    return await testExtension(unpackedPath, { screenshotPath: options.screenshotPath });
  } catch (error) {
    return { status: "unavailable", message: error.message };
  }
}

function throwIfViolations(violations, mutations) {
  if (violations.length === 0) return;
  const error = new Error(`Compilation stopped: ${violations.map(({ message }) => message).join(" ")}`);
  error.name = "ExtensionValidationError";
  error.violations = violations;
  error.mutations = mutations;
  throw error;
}

/** Retains a manifest-only API for callers that do not need packaging. */
export async function createManifestFromPrompt(description, options = {}) {
  return generateManifest(description, options);
}

/** Repairs one reported file, then runs the same deterministic security gate and packager. */
export async function repairCompiledExtension(description, previousFiles, violation, options = {}) {
  if (!previousFiles || typeof previousFiles !== "object") throw new TypeError("previousFiles must be a file map.");
  const original = { description, files: previousFiles, requestedScaffolds: [] };
  reportStage(options, "Preparing targeted repair");
  const repaired = await repairExtension(description, original, [{
    rule: violation?.rule ?? "reported-violation",
    filename: violation?.file ?? "unknown.js",
    message: violation?.detail ?? "Repair the reported violation.",
    loc: null,
    fixable: true
  }], options);
  const mutations = [];
  reportStage(options, "Resolving approved scaffolds");
  let extension = await resolveScaffolds(repaired);
  reportStage(options, "Applying security checks and permission downscoping");
  extension = applySecurityPipeline(extension, mutations);
  reportStage(options, "Linting and validating repaired code");
  const violations = [...validateExtension(extension), ...(await lintExtension(extension))];
  throwIfViolations(violations, mutations);
  reportStage(options, "Bundling repaired extension ZIP");
  const packaged = await packageExtension(extension, options);
  return {
    archivePath: packaged.archivePath,
    files: packaged.files,
    mutations,
    permissionOptimization: extension.permissionOptimization,
    manifest: JSON.parse(extension.files["manifest.json"])
  };
}

function reportStage(options, label) {
  if (typeof options.onStage === "function") options.onStage(label);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const runE2E = args.includes("--e2e");
  const proof = args.includes("--proof");
  const description = args.filter((argument) => argument !== "--e2e" && argument !== "--proof").join(" ");
  compileExtension(description, {
    runE2E,
    keepUnpacked: runE2E || proof,
    keepSource: proof,
    sourceOutputPath: proof ? "dist/generated-extension-source" : undefined,
    unpackedOutputPath: runE2E || proof ? "dist/unpacked-extension" : undefined,
    screenshotPath: runE2E ? "dist/extension-preview.png" : undefined
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Compilation failed: ${error.message}`);
      if (error.violations) console.error(JSON.stringify(error.violations, null, 2));
      process.exitCode = 1;
    });
}
