# AI-to-MV3 Extension Compiler — Build Summary

## Purpose

This project compiles a natural-language Chrome extension request into a validated, bundled Manifest V3 extension archive.

## Completed pipeline

1. **AI orchestration** — `ai-orchestrator.js` calls either OpenAI or GitHub Models and requests one JSON payload containing a Manifest V3 object plus all local source files.
2. **Static validation** — `validator.js` parses generated JavaScript with Babel without executing it. It validates the manifest, referenced files, DNR rules, and policy-sensitive JavaScript patterns.
3. **Least-privilege optimization** — `permission-optimizer.js` replaces broad `host_permissions` with exact HTTP/HTTPS origins found in static `fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` AST calls. Dynamic network targets stop the build rather than receiving broad access.
4. **Vendor ingestion** — `vendor-ingestor.js` resolves safe, version-pinned bare npm imports through esm.sh, verifies the browser bundle, writes one virtual `vendor/` source per package, and records its SHA-256 in `vendor-lock.json`.
5. **AST mutation** — `mutator.js` applies narrow, safe repairs. It rewrites `chrome.browserAction` to `chrome.action` and changes bare imports to relative `vendor/` imports.
6. **Packaging** — `packager.js` writes the source tree to an isolated build directory, bundles/minifies JavaScript with esbuild, and creates a sideloadable zip with JSZip.

## Deterministic policy checks

- Manifest V3 is required.
- Broad host access such as `<all_urls>` and `https://*/*` is rejected.
- `webRequestBlocking` is rejected; DNR configuration requires the `declarativeNetRequest` permission.
- `chrome.browserAction` is detected and auto-repaired to `chrome.action`.
- `eval()`, `new Function()`, remote imports, remote `src` assignments, and dynamically-created script elements are blocked.
- `setInterval()` and `setTimeout()` in background/service-worker files are blocked in favor of `chrome.alarms` and persisted timestamps.
- Async `chrome.runtime.onMessage` handlers that fail to keep the response channel open are flagged.
- Manifest-referenced files and DNR rule structure are checked before packaging.
- Bare package imports must be exact version-pinned names such as `nanoid@5.1.5`; URLs, tags, ranges, and tarballs are not accepted by the vendor stage.
- Broad host permissions are downscoped only from literal network URLs; selectors and dynamic URLs do not provide enough evidence to infer a safe host permission.

## Security boundary

The compiler never accepts URL imports or raw npm tarballs. It permits only exact version-pinned bare imports, fetches an esm.sh browser bundle once per package, checks that the result is self-contained JavaScript, and records its SHA-256 in `vendor-lock.json`. URL imports, unpinned package specs, and unresolved bundle imports stop the build.

The virtual `vendor/` source folder is a build input. esbuild folds its contents into the generated entry files, then the packager removes that source folder from the final zip to avoid duplicate library code. The lock file remains in the archive as an audit record.

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

A live GitHub Models run generated the Local ID Notes extension, validated it, vendored the version-pinned `nanoid@5.1.5` dependency, bundled its JavaScript, and created:

- `dist/generated-extension.zip`

The archive contains `manifest.json`, `popup.html`, the bundled `popup.js`, and `vendor-lock.json`. Its zip integrity was verified after packaging; no remote import or esm.sh URL remains in the final JavaScript.

The least-privilege test archive, `dist/btc-tracker-least-privilege.zip`, was built from a deliberately broad BTC Tracker input. The optimizer replaced `<all_urls>` with the stricter `https://api.coindesk.com/*` permission and the resulting zip was verified.

## Key source files

- `ai-orchestrator.js` — model provider setup and extension source generation.
- `validator.js` — manifest, DNR, and Babel AST policy checks.
- `permission-optimizer.js` — static network-origin discovery and host-permission downscoping.
- `mutator.js` — safe AST repairs.
- `packager.js` — esbuild bundling and JSZip archive creation.
- `index.js` — end-to-end compiler entry point.
- `chatbot.js` — interactive compiler chat.
