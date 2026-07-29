import { afterAll, describe, expect, test } from "bun:test";

import {
  createConnection,
  deleteConnection,
  listConnections,
  recordConnectionTest,
  updateConnection,
} from "./llm.services";

// Integración real contra la BD (Neon). Correr con:
//   RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test
const runDb = process.env.RUN_DB_TESTS === "1";
const t = test.skipIf(!runDb);

// Debe existir en la tabla `user` cuando se ejecuten los tests de BD.
const TEST_USER_ID = process.env.TEST_USER_ID ?? "test-user-00000000";

const createdIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdIds) {
    await deleteConnection(TEST_USER_ID, id).catch(() => {});
  }
});

describe("conexiones (db)", () => {
  t("create/list/update/delete roundtrip", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-anthropic-${Date.now()}`,
      provider: "anthropic",
      apiKey: "sk-test-abcd1234",
    });
    createdIds.push(created.id);

    expect(created.userId).toBe(TEST_USER_ID);
    expect(created.apiKeyEncrypted).not.toBeNull();
    expect(created.apiKeyEncrypted).not.toContain("sk-test");
    expect(created.keyHint).toBe("1234");
    expect(created.lastTestStatus).toBeNull();

    const listed = await listConnections(TEST_USER_ID);
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const updated = await updateConnection(TEST_USER_ID, created.id, {
      label: `renombrada-${Date.now()}`,
    });
    // sin apiKey en el update, la key cifrada se conserva
    expect(updated?.apiKeyEncrypted).toBe(created.apiKeyEncrypted);
  });

  t("otro usuario no ve las conexiones del primero", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-isolation-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-isolation-test",
    });
    createdIds.push(created.id);

    const otras = await listConnections("other-user-99999999");
    expect(otras.some((r) => r.id === created.id)).toBe(false);
  });

  t("otro usuario no puede actualizar ni borrar una conexión ajena", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-tenant-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-tenant-test",
    });
    createdIds.push(created.id);

    expect(await updateConnection("other-user-99999999", created.id, { label: "hack" })).toBeNull();
    expect(await deleteConnection("other-user-99999999", created.id)).toBeNull();
    expect((await listConnections(TEST_USER_ID)).some((r) => r.id === created.id)).toBe(true);
  });

  t("recordConnectionTest guarda estado y fecha", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-probe-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-probe-test",
    });
    createdIds.push(created.id);

    const updated = await recordConnectionTest(TEST_USER_ID, created.id, "failed");
    expect(updated?.lastTestStatus).toBe("failed");
    expect(updated?.lastTestedAt).not.toBeNull();
  });
});
