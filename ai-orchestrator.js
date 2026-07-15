import OpenAI from "openai";

const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini";
const GITHUB_DEFAULT_MODEL = "openai/gpt-4.1";
const GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference";
const SAFE_FILE_PATH = /^(?!.*(?:^|\/)\.\.?\/)[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const SUPPORTED_FILE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg"]);

const SYSTEM_PROMPT = `
You are a Chrome extension security architect. Build a complete, working Chrome
Manifest V3 extension from the user's request.

Return one JSON object with exactly two fields:
{
  "manifest": { "...": "valid MV3 manifest fields" },
  "files": [{ "path": "popup.html", "content": "file contents" }]
}

The manifest must use manifest_version 3. Include every local file referenced
by the manifest in files. Use a service worker and chrome.alarms for scheduled
work; never keep a service worker alive with setInterval or recursive
setTimeout. Use chrome.action rather than chrome.browserAction. Use
declarativeNetRequest rather than blocking webRequest. Never use eval, new
Function, remote imports, CDN scripts, dynamically-created script elements, or
remotely hosted executable code. Use only least-privilege permissions. Never
use <all_urls>, *://*/*, http://*/*, or https://*/*. If the feature would need
site access but no site is named, use activeTab after a user gesture or explain
the limitation in the UI. Return JSON only, with no Markdown code fences.

When a third-party package is essential, use a version-pinned bare npm import
such as "nanoid@5.1.5". Do not use a URL import; the compiler vendors approved
bare imports locally before bundling.

The source protocol accepts text files only. Do not declare PNG/JPEG icons. You
may omit icons or use a locally generated SVG file when an icon is necessary.
`.trim();

/**
 * Generates an extension source tree as JSON and normalizes it into the shared
 * compiler payload shape.
 *
 * @param {string} userPrompt Natural-language extension request.
 * @param {{client?: OpenAI, model?: string}} [options] Test/runtime overrides.
 * @returns {Promise<{description: string, files: Record<string, string>}>}
 */
export async function generateExtension(userPrompt, options = {}) {
  if (typeof userPrompt !== "string" || !userPrompt.trim()) {
    throw new TypeError("A non-empty extension request is required.");
  }

  const provider = options.client ? null : createModelProvider();
  const client = options.client ?? provider.client;
  const model = options.model ?? provider?.model ?? process.env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL;

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt.trim() }
      ]
    });
  } catch (error) {
    throw new Error(`LLM extension generation failed: ${error.message}`, { cause: error });
  }

  const message = completion.choices?.[0]?.message;
  if (message?.refusal) {
    throw new Error(`The model declined this request: ${message.refusal}`);
  }
  if (!message?.content) {
    throw new Error("The model returned no extension content.");
  }

  let generated;
  try {
    generated = JSON.parse(message.content);
  } catch (error) {
    throw new SyntaxError(`The model returned invalid extension JSON: ${error.message}`);
  }

  return normalizeGeneratedExtension(userPrompt, generated);
}

/** Generates only the manifest portion for callers that do not need packaging. */
export async function generateManifest(userPrompt, options = {}) {
  const extension = await generateExtension(userPrompt, options);
  return JSON.parse(extension.files["manifest.json"]);
}

function normalizeGeneratedExtension(description, generated) {
  if (!generated || typeof generated !== "object" || Array.isArray(generated)) {
    throw new TypeError("The model response must be an object containing manifest and files.");
  }
  if (!generated.manifest || typeof generated.manifest !== "object" || Array.isArray(generated.manifest)) {
    throw new TypeError("The model response must contain a manifest object.");
  }
  if (!Array.isArray(generated.files)) {
    throw new TypeError("The model response must contain a files array.");
  }

  const files = {
    "manifest.json": `${JSON.stringify(generated.manifest, null, 2)}\n`
  };
  for (const file of generated.files) {
    if (!file || typeof file !== "object") {
      throw new TypeError("Each generated file must be an object.");
    }
    assertSafeFilePath(file.path);
    if (file.path === "manifest.json") {
      throw new Error("The manifest must be returned in the manifest field, not files.");
    }
    if (typeof file.content !== "string") {
      throw new TypeError(`Generated file ${file.path} must have string content.`);
    }
    if (Object.hasOwn(files, file.path)) {
      throw new Error(`The model generated duplicate file path: ${file.path}`);
    }
    files[file.path] = file.content;
  }

  return { description: description.trim(), files };
}

function assertSafeFilePath(filePath) {
  if (typeof filePath !== "string" || !SAFE_FILE_PATH.test(filePath)) {
    throw new Error(`Unsafe generated file path: ${String(filePath)}`);
  }
  const extension = filePath.slice(filePath.lastIndexOf("."));
  if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported generated file type: ${filePath}`);
  }
}

function createModelProvider() {
  const provider = process.env.LLM_PROVIDER ?? (process.env.GITHUB_TOKEN ? "github" : "openai");

  if (provider === "github") {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is required when LLM_PROVIDER=github.");
    }
    return {
      client: new OpenAI({
        apiKey: process.env.GITHUB_TOKEN,
        baseURL: GITHUB_MODELS_BASE_URL,
        defaultHeaders: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10"
        }
      }),
      model: process.env.GITHUB_MODEL ?? GITHUB_DEFAULT_MODEL
    };
  }

  if (provider !== "openai") {
    throw new Error("LLM_PROVIDER must be either 'openai' or 'github'.");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai.");
  }
  return {
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    model: process.env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL
  };
}
