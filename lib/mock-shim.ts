export const MOCK_SHIM_SOURCE = String.raw`
(() => {
  const send = (api, detail, isError = false) => parent.postMessage({ source: "extension-sandbox", api, detail, isError }, "*");
  const callback = (cb, value) => { if (typeof cb === "function") queueMicrotask(() => cb(value)); return Promise.resolve(value); };
  const storage = {};
  const mock = (name, implementation) => (...args) => {
    try { send(name, args.length ? JSON.stringify(args) : "called"); return implementation(...args); }
    catch (error) { send(name, error.message, true); throw error; }
  };
  const runtime = {
    id: "sandbox-extension",
    getURL: mock("chrome.runtime.getURL", (path = "") => "sandbox://" + path),
    sendMessage: mock("chrome.runtime.sendMessage", (...args) => callback(args.at(-1), { ok: true })),
    onMessage: { addListener: mock("chrome.runtime.onMessage.addListener", () => undefined) },
    onInstalled: { addListener: mock("chrome.runtime.onInstalled.addListener", () => undefined) }
  };
  const chrome = {
    runtime,
    storage: {
      local: {
        get: mock("chrome.storage.local.get", (keys, cb) => { const result = typeof keys === "string" ? { [keys]: storage[keys] } : storage; return callback(cb, result); }),
        set: mock("chrome.storage.local.set", (items, cb) => { Object.assign(storage, items); return callback(cb); }),
        clear: mock("chrome.storage.local.clear", (cb) => { Object.keys(storage).forEach((key) => delete storage[key]); return callback(cb); })
      },
      onChanged: { addListener: mock("chrome.storage.onChanged.addListener", () => undefined) }
    },
    tabs: { query: mock("chrome.tabs.query", (_query, cb) => callback(cb, [{ id: 1, title: "Sandbox tab", url: "https://example.test" }])) },
    action: { setBadgeText: mock("chrome.action.setBadgeText", () => Promise.resolve()) },
    scripting: { executeScript: mock("chrome.scripting.executeScript", () => Promise.resolve([])) }
  };
  window.chrome = chrome;
  window.browser = chrome;
  window.ethereum = {
    request: mock("ethereum.request", ({ method }) => {
      if (method === "eth_requestAccounts") return Promise.resolve(["0x000000000000000000000000000000000000dEaD"]);
      if (method === "eth_chainId") return Promise.resolve("0x1");
      return Promise.resolve(null);
    })
  };
  window.addEventListener("error", (event) => send("Runtime error", event.message, true));
  window.addEventListener("unhandledrejection", (event) => send("Unhandled promise", String(event.reason), true));
  send("Sandbox ready", "Mock Chrome APIs are active");
})();
`;
