/** Returns the injected Solana provider without handling private keys. */
export function getSolanaProvider() {
  const provider = globalThis.solana;
  if (!provider || typeof provider.connect !== "function") {
    throw new Error("No Solana wallet provider is available.");
  }
  return provider;
}

/** Connects only after an explicit user action and returns the public key. */
export async function connectSolanaWallet() {
  const response = await getSolanaProvider().connect();
  return response.publicKey?.toString() ?? null;
}
