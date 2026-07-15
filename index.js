import { generateExtension, generateManifest } from "./ai-orchestrator.js";
import { mutateExtension } from "./mutator.js";
import { packageExtension } from "./packager.js";
import { validateExtension } from "./validator.js";

/** Runs generation, validation, mutation, revalidation, and packaging. */
export async function compileExtension(description, options = {}) {
  if (typeof description !== "string" || !description.trim()) {
    throw new TypeError("A non-empty extension description is required.");
  }

  const generated = await generateExtension(description, options);
  const initialViolations = validateExtension(generated);
  const corrected = mutateExtension(generated, initialViolations);
  const remainingViolations = validateExtension(corrected);

  if (remainingViolations.length > 0) {
    const error = new Error(`Compilation stopped: ${remainingViolations.map(({ message }) => message).join(" ")}`);
    error.name = "ExtensionValidationError";
    error.violations = remainingViolations;
    error.mutations = corrected.mutations;
    throw error;
  }

  const packaged = await packageExtension(corrected, options);
  return {
    archivePath: packaged.archivePath,
    files: packaged.files,
    mutations: corrected.mutations,
    manifest: JSON.parse(corrected.files["manifest.json"])
  };
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
