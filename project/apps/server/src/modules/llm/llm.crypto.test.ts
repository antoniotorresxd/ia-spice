import { describe, expect, test } from "bun:test";

import { decryptApiKey, encryptApiKey } from "./llm.crypto";

const KEY_A = "a".repeat(64); // 32 bytes hex
const KEY_B = "b".repeat(64);

describe("llm.crypto", () => {
  test("roundtrip encrypt -> decrypt returns the original", () => {
    const stored = encryptApiKey("sk-super-secret-123", KEY_A);
    expect(stored).not.toContain("sk-super-secret-123");
    expect(stored.split(":")).toHaveLength(3);
    expect(decryptApiKey(stored, KEY_A)).toBe("sk-super-secret-123");
  });

  test("two encryptions of the same plaintext differ (random IV)", () => {
    expect(encryptApiKey("same", KEY_A)).not.toBe(encryptApiKey("same", KEY_A));
  });

  test("decrypting with the wrong master key throws", () => {
    const stored = encryptApiKey("sk-x", KEY_A);
    expect(() => decryptApiKey(stored, KEY_B)).toThrow();
  });

  test("decrypting a malformed blob throws", () => {
    expect(() => decryptApiKey("not-a-valid-blob", KEY_A)).toThrow();
  });
});
