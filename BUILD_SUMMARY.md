# AI-to-MV3 Extension Compiler — Build Summary

## Purpose

This project compiles a natural-language Chrome extension request into a validated, bundled Manifest V3 extension archive.

## Completed pipeline

1. **AI orchestration** — `ai-orchestrator.js` calls either OpenAI or GitHub Models and requests one JSON payload containing a Manifest V3 object plus all local source files.
2. **Static validation** — `validator.js` parses generated JavaScript with Babel without executing it. It validates the manifest, referenced files, DNR rules, and policy-sensitive JavaScript patterns.
3. **AST mutation** — `mutator.js` applies narrow, safe repairs. It currently rewrites `chrome.browserAction` to `chrome.action`.
4. **Packaging** — `packager.js` writes the source tree to an isolated build directory, bundles/minifies JavaScript with esbuild, and creates a sideloadable zip with JSZip.

## Deterministic policy checks

- Manifest V3 is required.
- Broad host access such as `<all_urls>` and `https://*/*` is rejected.
- `webRequestBlocking` is rejected; DNR configuration requires the `declarativeNetRequest` permission.
- `chrome.browserAction` is detected and auto-repaired to `chrome.action`.
- `eval()`, `new Function()`, remote imports, remote `src` assignments, and dynamically-created script elements are blocked.
- `setInterval()` and `setTimeout()` in background/service-worker files are blocked in favor of `chrome.alarms` and persisted timestamps.
- Async `chrome.runtime.onMessage` handlers that fail to keep the response channel open are flagged.
- Manifest-referenced files and DNR rule structure are checked before packaging.

## Security boundary

The compiler never downloads a CDN dependency automatically. A remote-code finding blocks the build instead. Ingesting a dependency safely requires a separate allowlist, pinned version, integrity hash, license check, and review workflow.

## Provider configuration

The local `.env` file is loaded automatically by the run commands.

```env
LLM_PROVIDER=github
GITHUB_TOKEN=your-github-models-token
GITHUB_MODEL=openai/gpt-4.1
```

`GITHUB_TOKEN` must remain local; `.env` is excluded by `.gitignore`.

## Commands

```bash
npm start
npm run compile -- 'Create a popup extension that stores a note locally'
npm run lint
```

`npm start` opens the interactive chatbot. `npm run compile` runs a single prompt through the complete pipeline.

## Verified output

A live GitHub Models run generated the Quick Notes extension, validated it, bundled its JavaScript, and created:

- `dist/generated-extension.zip`

The archive contains `manifest.json`, `popup.html`, `popup.js`, and a local SVG icon. Its zip integrity was verified after packaging.

## Key source files

- `ai-orchestrator.js` — model provider setup and extension source generation.
- `validator.js` — manifest, DNR, and Babel AST policy checks.
- `mutator.js` — safe AST repairs.
- `packager.js` — esbuild bundling and JSZip archive creation.
- `index.js` — end-to-end compiler entry point.
- `chatbot.js` — interactive compiler chat.
