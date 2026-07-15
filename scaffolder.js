import { readFile } from "node:fs/promises";

/** Reviewed module contract shared by generation, validation, and packaging. */
export const SCAFFOLD_CATALOG = Object.freeze({
  "web3-evm-provider": Object.freeze({
    file: "web3-evm-provider.js",
    exports: Object.freeze(["getEvmProvider", "requestEvmAccounts", "getEvmChainId"])
  }),
  "web3-solana-provider": Object.freeze({
    file: "web3-solana-provider.js",
    exports: Object.freeze(["getSolanaProvider", "connectSolanaWallet"])
  }),
  "social-dom-scraper": Object.freeze({
    file: "social-dom-scraper.js",
    exports: Object.freeze(["observeSocialFeed"])
  })
});

/** Adds only reviewed scaffold source requested from the approved catalog. */
export async function resolveScaffolds(extension, requestedIds = extension.requestedScaffolds ?? []) {
  if (!extension || typeof extension !== "object" || !extension.files) {
    throw new TypeError("Generated extension must contain a files object.");
  }
  if (!Array.isArray(requestedIds)) throw new TypeError("requested scaffold IDs must be an array.");

  const files = { ...extension.files };
  const trustedScaffolds = [];
  for (const id of [...new Set(requestedIds)].sort()) {
    const scaffold = SCAFFOLD_CATALOG[id];
    if (!scaffold) throw new Error(`Requested scaffold is not in the approved catalog: ${id}`);
    const targetPath = `scaffold/${scaffold.file}`;
    files[targetPath] = await readFile(new URL(`./scaffolds/${scaffold.file}`, import.meta.url), "utf8");
    trustedScaffolds.push(targetPath);
  }
  return { ...extension, files, requestedScaffolds: [...new Set(requestedIds)].sort(), trustedScaffolds };
}
