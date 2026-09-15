const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Computes the `sha256=<hex>` value GitHub sends in `X-Hub-Signature-256`. */
export async function signPayload(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

/**
 * Verifies a GitHub webhook signature in constant time.
 * https://docs.github.com/webhooks/using-webhooks/validating-webhook-deliveries
 */
export async function verifySignature(secret: string, body: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const provided = hexToBytes(signatureHeader.slice("sha256=".length));
  if (!provided) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  if (expected.byteLength !== provided.byteLength) return false;
  return crypto.subtle.timingSafeEqual(expected, provided);
}
