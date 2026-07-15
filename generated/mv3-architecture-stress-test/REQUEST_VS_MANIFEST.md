# Request vs. manifest traceability

This folder contains one combined MV3 manifest. It is a permission and entry-point contract, not the full implementation.

| Test request | Manifest section | What the manifest guarantees | Required implementation outside the manifest |
| --- | --- | --- | --- |
| Time tracker that survives the MV3 service-worker lifecycle | `background`, `permissions: ["alarms", "tabs", "storage"]` | A module service worker can use the required APIs without broad website access. | `background.js` must use `chrome.alarms` plus persisted timestamps; it must not use a long-running `setInterval` loop. |
| Popup dark-mode toggle for the current page | `action.default_popup`, `permissions: ["activeTab", "scripting"]` | A popup is available, and a user action can grant temporary access to the active tab for injection. | `popup.html`/`popup.js` must send the request; `background.js` or the popup must inject only packaged code into the selected tab. |
| Block Facebook and Twitter from 09:00–17:00 | `permissions: ["declarativeNetRequest", "alarms"]`, `declarative_net_request.rule_resources` | A static DNR ruleset is declared without `webRequestBlocking` or permanent host permissions. | `background.js` must enable `work-hours-blocking` at 09:00 and disable it at 17:00 using alarms. The actual block conditions are in `rules.json`. |
| Double-click formula renderer using mathjs | `permissions: ["activeTab", "scripting"]`, `optional_host_permissions` | The extension can operate after explicit user activation or site-specific permission approval, without `<all_urls>`. | Bundle the math library locally and use a safe evaluator. A true double-click listener on every site would require broad site access, so it is intentionally not granted by this manifest. |

## Security assertions

- No `<all_urls>` or broad permanent `host_permissions`.
- No Manifest V2 `browserAction` or `webRequestBlocking` permission.
- No remotely hosted JavaScript, dynamic `<script>` injection, or `eval`.
- DNR rules start disabled; time logic belongs in the service worker.

## Artifacts

- `manifest.json` — consolidated Manifest V3 contract.
- `rules.json` — static Facebook/Twitter blocking rules.
- `TEST-MAPPING.md` — short architecture summary.
