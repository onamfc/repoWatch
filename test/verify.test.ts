import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "../src/github/verify";

const secret = "It's a Secret to Everybody";
const body = "Hello, World!";
// Known-good value from GitHub's own documentation for the secret/body above.
const documented = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";

describe("verifySignature", () => {
  it("accepts GitHub's documented example", async () => {
    expect(await signPayload(secret, body)).toBe(documented);
    expect(await verifySignature(secret, body, documented)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    expect(await verifySignature(secret, body + " ", documented)).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    expect(await verifySignature("nope", body, documented)).toBe(false);
  });

  it("rejects missing, malformed, or wrongly-sized signatures", async () => {
    expect(await verifySignature(secret, body, null)).toBe(false);
    expect(await verifySignature(secret, body, "sha1=abc")).toBe(false);
    expect(await verifySignature(secret, body, "sha256=zz")).toBe(false);
    expect(await verifySignature(secret, body, "sha256=abcd")).toBe(false);
  });
});
