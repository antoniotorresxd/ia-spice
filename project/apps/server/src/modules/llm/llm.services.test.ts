import { afterAll, describe, expect, test } from "bun:test";

import {
  activateLlmConfig,
  createLlmConfig,
  deleteLlmConfig,
  getActiveLlmResolved,
  listLlmConfigs,
  updateLlmConfig,
} from "./llm.services";

// Integración real contra la BD (Neon). Correr con: RUN_DB_TESTS=1 bun test
const runDb = process.env.RUN_DB_TESTS === "1";
const t = test.skipIf(!runDb);

const createdIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdIds) {
    await deleteLlmConfig(id).catch(() => {});
  }
});

describe("llm.services (db)", () => {
  t("create/list/update/delete roundtrip", async () => {
    const created = await createLlmConfig({
      label: `test-anthropic-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-test-abcd1234",
    });
    createdIds.push(created.id);

    expect(created.apiKeyEncrypted).not.toBeNull();
    expect(created.apiKeyEncrypted).not.toContain("sk-test");
    expect(created.keyHint).toBe("1234");

    const listed = await listLlmConfigs();
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const updated = await updateLlmConfig(created.id, { model: "claude-haiku-4-5" });
    expect(updated?.model).toBe("claude-haiku-4-5");
    // sin apiKey en el update, la key cifrada se conserva
    expect(updated?.apiKeyEncrypted).toBe(created.apiKeyEncrypted);
  });

  t("activate deactivates the previous active", async () => {
    const a = await createLlmConfig({
      label: `test-a-${Date.now()}`,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-aaaa",
    });
    const b = await createLlmConfig({
      label: `test-b-${Date.now()}`,
      provider: "openai_compatible",
      model: "llama3.1:8b",
      baseUrl: "http://localhost:11434/v1",
    });
    createdIds.push(a.id, b.id);

    await activateLlmConfig(a.id);
    await activateLlmConfig(b.id);

    const listed = await listLlmConfigs();
    const actives = listed.filter((r) => r.isActive && createdIds.includes(r.id));
    expect(actives).toHaveLength(1);
    expect(actives[0]!.id).toBe(b.id);
  });

  t("getActiveLlmResolved returns the contract shape with decrypted key", async () => {
    const a = await createLlmConfig({
      label: `test-resolved-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-resolved-9999",
    });
    createdIds.push(a.id);
    await activateLlmConfig(a.id);

    const active = await getActiveLlmResolved();
    expect(active).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      api_key: "sk-resolved-9999",
      base_url: null,
    });
  });
});
