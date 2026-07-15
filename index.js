import { generateExtension, generateManifest } from "./ai-orchestrator.js";
import { mutateExtension, rewriteExternalImports } from "./mutator.js";
import { packageExtension } from "./packager.js";
import { optimizeHostPermissions } from "./permission-optimizer.js";
import { collectExternalDependencies, validateExtension } from "./validator.js";
import { ingestDependencies } from "./vendor-ingestor.js";

/** Runs generation, validation, mutation, revalidation, and packaging. */
export async function compileExtension(description, options = {}) {
  if (typeof description !== "string" || !description.trim()) {
    throw new TypeError("A non-empty extension description is required.");
  }

  const generated = await generateExtension(description, options);
  const initialViolations = validateExtension(generated);
  const corrected = mutateExtension(generated, initialViolations);
  const permissionOptimized = optimizeHostPermissions(corrected);
  const postMutationViolations = [
    ...validateExtension(permissionOptimized),
    ...permissionOptimized.permissionViolations
  ];

  throwIfViolations(postMutationViolations, corrected.mutations);

  const dependencies = collectExternalDependencies(permissionOptimized);
  const ingested = await ingestDependencies(permissionOptimized, dependencies, options);
  const rewritten = rewriteExternalImports(ingested, ingested.vendorMap);
  const finalViolations = validateExtension(rewritten);
  const unresolvedDependencies = collectExternalDependencies(rewritten);
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
  throwIfViolations(finalViolations, corrected.mutations);

  const packaged = await packageExtension(rewritten, options);
  return {
    archivePath: packaged.archivePath,
    files: packaged.files,
    mutations: corrected.mutations,
    permissionOptimization: permissionOptimized.permissionOptimization,
    vendorDependencies: ingested.vendored,
    vendorRewrites: rewritten.vendorRewrites,
    manifest: JSON.parse(rewritten.files["manifest.json"])
  };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const description = process.argv.slice(2).join(" ");
  compileExtension(description)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Compilation failed: ${error.message}`);
      if (error.violations) console.error(JSON.stringify(error.violations, null, 2));
      process.exitCode = 1;
    });
}
