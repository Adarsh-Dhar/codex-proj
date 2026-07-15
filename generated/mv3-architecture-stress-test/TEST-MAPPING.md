# MV3 architecture stress-test mapping

- **Time tracker:** `alarms`, `tabs`, and `storage`; `background.js` must use alarms and persisted timestamps, not a service-worker `setInterval` loop.
- **Dark-mode toggle:** `action.default_popup`, `activeTab`, and `scripting`; `popup.html` should request injection only after a user click.
- **Work-hours blocker:** `declarativeNetRequest` and `rules.json`; the ruleset begins disabled and `background.js` must enable it only from 09:00 to 17:00 using alarms.
- **Formula renderer:** `activeTab` and `scripting`; bundle the math renderer within the extension. The optional `example.com` permission is an intentional, user-granted test host—there is no broad host permission and no remotely hosted code.

This manifest deliberately does not declare `<all_urls>`, `webRequestBlocking`, a CDN, or `eval` capability.
