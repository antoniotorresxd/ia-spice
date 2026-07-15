import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import env from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

// masterKeyHex es inyectable para tests; en producción siempre viene de env.
export function encryptApiKey(plain: string, masterKeyHex: string = env.LLM_SECRETS_KEY): string {
  const key = Buffer.from(masterKeyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

export function decryptApiKey(stored: string, masterKeyHex: string = env.LLM_SECRETS_KEY): string {
  const [ivB64, ciphertextB64, authTagB64] = stored.split(":");
  if (!ivB64 || !ciphertextB64 || !authTagB64) {
    throw new Error("malformed encrypted api key");
  }
  const key = Buffer.from(masterKeyHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
