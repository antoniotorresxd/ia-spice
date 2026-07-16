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

// ID de usuario ficticio para pruebas de integración.
// Debe existir en la tabla `user` cuando se ejecuten los tests de BD.
const TEST_USER_ID = process.env.TEST_USER_ID ?? "test-user-00000000";

const createdIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdIds) {
    await deleteLlmConfig(TEST_USER_ID, id).catch(() => {});
  }
});

describe("llm.services (db)", () => {
  t("create/list/update/delete roundtrip", async () => {
    const created = await createLlmConfig(TEST_USER_ID, {
      label: `test-anthropic-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-test-abcd1234",
    });
    createdIds.push(created.id);

    expect(created.userId).toBe(TEST_USER_ID);
    expect(created.apiKeyEncrypted).not.toBeNull();
    expect(created.apiKeyEncrypted).not.toContain("sk-test");
    expect(created.keyHint).toBe("1234");

    const listed = await listLlmConfigs(TEST_USER_ID);
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const updated = await updateLlmConfig(TEST_USER_ID, created.id, {
      model: "claude-haiku-4-5",
    });
    expect(updated?.model).toBe("claude-haiku-4-5");
    // sin apiKey en el update, la key cifrada se conserva
    expect(updated?.apiKeyEncrypted).toBe(created.apiKeyEncrypted);
  });

  t("otro usuario no ve las configs del primero", async () => {
    const created = await createLlmConfig(TEST_USER_ID, {
      label: `test-isolation-${Date.now()}`,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-isolation-test",
    });
    createdIds.push(created.id);

    const otherUserConfigs = await listLlmConfigs("other-user-99999999");
    expect(otherUserConfigs.some((r) => r.id === created.id)).toBe(false);
  });

  t("activate deactivates the previous active", async () => {
    const a = await createLlmConfig(TEST_USER_ID, {
      label: `test-a-${Date.now()}`,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-aaaa",
    });
    const b = await createLlmConfig(TEST_USER_ID, {
      label: `test-b-${Date.now()}`,
      provider: "openai_compatible",
      model: "llama3.1:8b",
      baseUrl: "http://localhost:11434/v1",
    });
    createdIds.push(a.id, b.id);

    await activateLlmConfig(TEST_USER_ID, a.id);
    await activateLlmConfig(TEST_USER_ID, b.id);

    const listed = await listLlmConfigs(TEST_USER_ID);
    const actives = listed.filter((r) => r.isActive && createdIds.includes(r.id));
    expect(actives).toHaveLength(1);
    expect(actives[0]!.id).toBe(b.id);
  });

  t("getActiveLlmResolved returns the contract shape with decrypted key", async () => {
    const a = await createLlmConfig(TEST_USER_ID, {
      label: `test-resolved-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-resolved-9999",
    });
    createdIds.push(a.id);
    await activateLlmConfig(TEST_USER_ID, a.id);

    const active = await getActiveLlmResolved(TEST_USER_ID);
    expect(active).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      api_key: "sk-resolved-9999",
      base_url: null,
    });
  });
});
