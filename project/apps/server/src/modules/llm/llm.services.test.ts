import { afterAll, describe, expect, test } from "bun:test";

import {
  createConnection,
  deleteConnection,
  listAssignments,
  listConnections,
  recordConnectionTest,
  updateConnection,
  upsertAssignment,
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

describe("asignaciones (db)", () => {
  t("upsert crea y luego actualiza sin duplicar", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-assign-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-assign-test",
    });
    createdIds.push(conn.id);

    const first = await upsertAssignment(TEST_USER_ID, "orchestrator", {
      connectionId: conn.id,
      model: "gpt-5",
    });
    expect(first).toEqual({ agentId: "orchestrator", connectionId: conn.id, model: "gpt-5" });

    const second = await upsertAssignment(TEST_USER_ID, "orchestrator", {
      connectionId: conn.id,
      model: "gpt-5-mini",
    });
    expect(second?.model).toBe("gpt-5-mini");

    const listed = await listAssignments(TEST_USER_ID);
    expect(listed.filter((a) => a.agentId === "orchestrator")).toHaveLength(1);
  });

  t("rechaza asignar una conexión de otro usuario", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-cross-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-cross-test",
    });
    createdIds.push(conn.id);

    const result = await upsertAssignment("other-user-99999999", "orchestrator", {
      connectionId: conn.id,
      model: "gpt-5",
    });
    expect(result).toBeNull();
  });

  t("borrar la conexión desasigna al agente en lugar de borrar la fila", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-setnull-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-setnull-test",
    });
    await upsertAssignment(TEST_USER_ID, "writer", {
      connectionId: conn.id,
      model: "gpt-5",
    });

    await deleteConnection(TEST_USER_ID, conn.id);

    const listed = await listAssignments(TEST_USER_ID);
    const writer = listed.find((a) => a.agentId === "writer");
    expect(writer?.connectionId).toBeNull();
    // el modelo sobrevive: el usuario solo perdió la credencial
    expect(writer?.model).toBe("gpt-5");
  });
});
