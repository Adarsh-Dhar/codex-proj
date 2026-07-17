import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

/**
 * Best-effort popup smoke test for an unpacked MV3 extension. A failed browser
 * launch is reported to the caller and never weakens the compiler security gate.
 */
export async function testExtension(unpackedPath, options = {}) {
  const manifest = JSON.parse(await readFile(join(unpackedPath, "manifest.json"), "utf8"));
  if (!manifest.background?.service_worker) {
    return { status: "skipped", reason: "No service worker is available to resolve the extension ID." };
  }
  if (!manifest.action?.default_popup) {
    return { status: "skipped", reason: "No action popup is declared for browser smoke testing." };
  }

  const userDataDir = await mkdtemp(join(tmpdir(), "mv3-e2e-profile-"));
  const screenshotPath = resolve(options.screenshotPath ?? "dist/extension-preview.png");
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${unpackedPath}`,
        `--load-extension=${unpackedPath}`
      ]
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/${manifest.action.default_popup}`);
    await page.waitForLoadState("domcontentloaded");
    let interacted = false;
    if (options.clickSelector) {
      // Extensions often have several controls (for example Start and a disabled
      // Stop button).  Test the first eligible control instead of requiring the
      // selector to resolve to exactly one element.
      const target = page.locator(options.clickSelector).first();
      if (await target.count()) {
        page.once("dialog", (dialog) => dialog.dismiss());
        await target.click();
        await page.waitForTimeout(300);
        interacted = true;
      }
    }
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
    return { status: "passed", extensionId, screenshotPath, interacted };
  } catch (error) {
    return { status: "failed", message: error.message };
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}
