import { and, eq } from "drizzle-orm";

import { db } from "@/db";

import { decryptApiKey, encryptApiKey } from "./llm.crypto";
import { llmConfig } from "./llm.model";

import type { CreateLlmConfigInput, UpdateLlmConfigInput } from "./llm.schemas";

export async function listLlmConfigs(userId: string) {
  return db
    .select()
    .from(llmConfig)
    .where(eq(llmConfig.userId, userId))
    .orderBy(llmConfig.createdAt);
}

export async function createLlmConfig(userId: string, input: CreateLlmConfigInput) {
  const [row] = await db
    .insert(llmConfig)
    .values({
      userId,
      label: input.label,
      provider: input.provider,
      model: input.model,
      apiKeyEncrypted: input.apiKey ? encryptApiKey(input.apiKey) : null,
      keyHint: input.apiKey ? input.apiKey.slice(-4) : null,
      baseUrl: input.baseUrl ?? null,
    })
    .returning();
  return row!;
}

export async function updateLlmConfig(
  userId: string,
  id: string,
  input: UpdateLlmConfigInput,
) {
  const values: Partial<typeof llmConfig.$inferInsert> = {};
  if (input.label !== undefined) values.label = input.label;
  if (input.model !== undefined) values.model = input.model;
  if (input.baseUrl !== undefined) values.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) {
    values.apiKeyEncrypted = encryptApiKey(input.apiKey);
    values.keyHint = input.apiKey.slice(-4);
  }
  if (Object.keys(values).length === 0) {
    const [row] = await db
      .select()
      .from(llmConfig)
      .where(and(eq(llmConfig.id, id), eq(llmConfig.userId, userId)))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .update(llmConfig)
    .set(values)
    .where(and(eq(llmConfig.id, id), eq(llmConfig.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteLlmConfig(userId: string, id: string) {
  const [row] = await db
    .delete(llmConfig)
    .where(and(eq(llmConfig.id, id), eq(llmConfig.userId, userId)))
    .returning();
  return row ?? null;
}

// El driver neon-http no soporta transacciones interactivas; se hacen dos
// updates secuenciales. El índice único parcial de la tabla garantiza que
// nunca queden dos activas aunque el proceso muera entre ambos updates
// (el estado intermedio posible es "ninguna activa", que es seguro).
export async function activateLlmConfig(userId: string, id: string) {
  await db
    .update(llmConfig)
    .set({ isActive: false })
    .where(and(eq(llmConfig.userId, userId), eq(llmConfig.isActive, true)));
  const [row] = await db
    .update(llmConfig)
    .set({ isActive: true })
    .where(and(eq(llmConfig.id, id), eq(llmConfig.userId, userId)))
    .returning();
  return row ?? null;
}

// Única función que descifra la key: alimenta el endpoint interno de agents.
export async function getActiveLlmResolved(userId: string) {
  const [row] = await db
    .select()
    .from(llmConfig)
    .where(and(eq(llmConfig.userId, userId), eq(llmConfig.isActive, true)))
    .limit(1);
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    api_key: row.apiKeyEncrypted ? decryptApiKey(row.apiKeyEncrypted) : null,
    base_url: row.baseUrl,
  };
}
