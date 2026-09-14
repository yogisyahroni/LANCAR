let fallbackCounter = 0;

/**
 * Create a client correlation/idempotency identifier without pseudo-random
 * runtime data. Web Crypto is preferred; the counter fallback is only for
 * legacy/non-browser runtimes where globalThis.crypto is unavailable.
 */
export function createClientId(prefix: string): string {
  const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (typeof webCrypto?.randomUUID === "function") {
    return `${prefix}-${webCrypto.randomUUID()}`;
  }

  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    const entropy = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${entropy}`;
  }

  fallbackCounter += 1;
  return `${prefix}-${Date.now()}-${fallbackCounter}`;
}
