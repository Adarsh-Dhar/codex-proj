/** Returns the injected EIP-1193 provider without storing private keys. */
export function getEvmProvider() {
  const provider = globalThis.ethereum;
  if (!provider || typeof provider.request !== "function") {
    throw new Error("No EIP-1193 wallet provider is available.");
  }
  return provider;
}

/** Requests the account list only after an explicit user action. */
export async function requestEvmAccounts() {
  const accounts = await getEvmProvider().request({ method: "eth_requestAccounts" });
  return Array.isArray(accounts) ? accounts : [];
}

/** Returns the currently selected EVM chain identifier. */
export async function getEvmChainId() {
  return getEvmProvider().request({ method: "eth_chainId" });
}
