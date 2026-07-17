export const MOCK_SHIM_SOURCE = String.raw`
(() => {
  const MINUTE_MS = 1000;
  const send = (api, detail, isError = false) => parent.postMessage({ source: "extension-sandbox", api, detail, isError }, "*");
  const callback = (cb, value) => { if (typeof cb === "function") queueMicrotask(() => cb(value)); return Promise.resolve(value); };
  const storage = {};
  const storageListeners = [];
  const installedListeners = [];
  const alarmListeners = [];
  const alarmTimers = new Map();
  const mock = (name, implementation) => (...args) => {
    try { send(name, args.length ? JSON.stringify(args) : "called"); return implementation(...args); }
    catch (error) { send(name, error.message, true); throw error; }
  };
  const notifyListeners = (api, listeners, args) => {
    for (const listener of listeners) {
      try { listener(...args); }
      catch (error) { send(api, error.message, true); }
    }
  };
  const emitStorageChanges = (changes) => {
    if (!Object.keys(changes).length) return;
    queueMicrotask(() => {
      send("chrome.storage.onChanged", JSON.stringify(changes));
      notifyListeners("chrome.storage.onChanged", storageListeners, [changes, "local"]);
    });
  };
  const clearAlarmTimer = (name) => {
    const timer = alarmTimers.get(name);
    if (!timer) return false;
    if (timer.kind === "interval") clearInterval(timer.handle);
    else clearTimeout(timer.handle);
    alarmTimers.delete(name);
    return true;
  };
  const fireAlarm = (name) => {
    const alarm = { name, scheduledTime: Date.now() };
    send("chrome.alarms.onAlarm", JSON.stringify(alarm));
    notifyListeners("chrome.alarms.onAlarm", alarmListeners, [alarm]);
  };
  const runtime = {
    id: "sandbox-extension",
    getURL: mock("chrome.runtime.getURL", (path = "") => "sandbox://" + path),
    sendMessage: mock("chrome.runtime.sendMessage", (...args) => callback(args.at(-1), { ok: true })),
    onMessage: { addListener: mock("chrome.runtime.onMessage.addListener", () => undefined) },
    onInstalled: { addListener: mock("chrome.runtime.onInstalled.addListener", (listener) => {
      if (typeof listener !== "function") return;
      installedListeners.push(listener);
      queueMicrotask(() => notifyListeners("chrome.runtime.onInstalled", [listener], [{ reason: "install" }]));
    }) }
  };
  const chrome = {
    runtime,
    storage: {
      local: {
        get: mock("chrome.storage.local.get", (keys, cb) => {
          const result = typeof keys === "string"
            ? { [keys]: storage[keys] }
            : Array.isArray(keys)
              ? Object.fromEntries(keys.map((key) => [key, storage[key]]))
              : { ...storage };
          return callback(cb, result);
        }),
        set: mock("chrome.storage.local.set", (items, cb) => {
          const changes = {};
          for (const [key, value] of Object.entries(items || {})) {
            changes[key] = { oldValue: storage[key], newValue: value };
            storage[key] = value;
          }
          emitStorageChanges(changes);
          return callback(cb);
        }),
        clear: mock("chrome.storage.local.clear", (cb) => {
          const changes = Object.fromEntries(Object.entries(storage).map(([key, value]) => [key, { oldValue: value }]));
          Object.keys(storage).forEach((key) => delete storage[key]);
          emitStorageChanges(changes);
          return callback(cb);
        })
      },
      onChanged: { addListener: mock("chrome.storage.onChanged.addListener", (listener) => {
        if (typeof listener === "function") storageListeners.push(listener);
      }) }
    },
    alarms: {
      create: mock("chrome.alarms.create", (name, details = {}) => {
        const alarmName = typeof name === "string" ? name : "__default";
        const options = typeof name === "string" ? details : (name || {});
        clearAlarmTimer(alarmName);
        const periodMs = Number(options.periodInMinutes) > 0 ? Number(options.periodInMinutes) * MINUTE_MS : 0;
        const delayMs = typeof options.when === "number"
          ? Math.max(0, (options.when - Date.now()) / 60)
          : Number(options.delayInMinutes) > 0
            ? Number(options.delayInMinutes) * MINUTE_MS
            : periodMs;
        const timeout = setTimeout(() => {
          fireAlarm(alarmName);
          if (!periodMs) {
            alarmTimers.delete(alarmName);
            return;
          }
          const interval = setInterval(() => fireAlarm(alarmName), periodMs);
          alarmTimers.set(alarmName, { kind: "interval", handle: interval });
        }, delayMs);
        alarmTimers.set(alarmName, { kind: "timeout", handle: timeout });
      }),
      clear: mock("chrome.alarms.clear", (name, cb) => callback(cb, clearAlarmTimer(name || "__default"))),
      onAlarm: { addListener: mock("chrome.alarms.onAlarm.addListener", (listener) => {
        if (typeof listener === "function") alarmListeners.push(listener);
      }) }
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
