import { afterAll, describe, expect, test } from "bun:test";

import {
  appendUserMessage,
  createConversationWithRequest,
  createProject,
  deleteConversation,
  deleteProject,
  getConversationDetail,
  getProjectDetail,
  getSnapshot,
  listProjectViews,
  makeDbSink,
  moveConversation,
  sweepStaleExecutions,
} from "./workspace.services";
import type { AgentsRunResult } from "./workspace.runner";

// Integración real contra la BD (Neon). Correr con:
//   RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test
const runDb = process.env.RUN_DB_TESTS === "1";
const t = test.skipIf(!runDb);

// Debe existir en la tabla `user` cuando se ejecuten los tests de BD.
const TEST_USER_ID = process.env.TEST_USER_ID ?? "test-user-00000000";
const OTHER_USER_ID = "test-user-ajeno";

const createdProjectIds: string[] = [];
const createdConversationIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdProjectIds) {
    await deleteProject(TEST_USER_ID, id).catch(() => {});
  }
  for (const id of createdConversationIds) {
    await deleteConversation(TEST_USER_ID, id).catch(() => {});
  }
});

describe("proyectos (db)", () => {
  t("create/list/get roundtrip con fileCount en cero", async () => {
    const created = await createProject(TEST_USER_ID, {
      name: `Filtros ${Date.now()}`,
      description: "pruebas",
    });
    createdProjectIds.push(created.id);

    expect(created.userId).toBe(TEST_USER_ID);

    const listed = await listProjectViews(TEST_USER_ID);
    const found = listed.find((item) => item.id === created.id);
    expect(found).toBeDefined();
    expect(found!.fileCount).toBe(0);
    expect(found!.conversationIds).toEqual([]);

    const detail = await getProjectDetail(TEST_USER_ID, created.id);
    expect(detail!.name).toBe(created.name);
    expect(detail!.conversations).toEqual([]);
  });

  t("el proyecto de otro usuario no se ve", async () => {
    const created = await createProject(TEST_USER_ID, { name: `Ajeno ${Date.now()}`, description: "" });
    createdProjectIds.push(created.id);

    expect(await getProjectDetail(OTHER_USER_ID, created.id)).toBeNull();
  });
});

describe("conversaciones (db)", () => {
  t("crear una solicitud deja mensaje de usuario y ejecución activa", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    expect(created.conversation.title).toBe("un divisor de 12V a 5V");
    expect(created.execution.status).toBe("active");
    expect(created.execution.requestText).toBe("un divisor de 12V a 5V");

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.messages).toHaveLength(1);
    expect(detail!.messages[0]!.role).toBe("user");
    expect(detail!.executionStatus).toBe("active");
    expect(detail!.files).toEqual([]);
  });

  t("un seguimiento añade mensaje y abre una ejecución nueva con el contexto", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    const followUp = await appendUserMessage(TEST_USER_ID, created.conversation.id, "ahora a 3.3V");

    expect(followUp).not.toBeNull();
    expect(followUp!.execution.status).toBe("active");
    expect(followUp!.requestText).toContain("Solicitud original: un divisor de 12V a 5V");
    expect(followUp!.requestText).toContain("Nueva instrucción: ahora a 3.3V");

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.messages).toHaveLength(2);
    // el título no cambia con los seguimientos
    expect(detail!.title).toBe("un divisor de 12V a 5V");
  });

  t("la conversación de otro usuario no se ve ni se puede continuar", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un filtro RC");
    createdConversationIds.push(created.conversation.id);

    expect(await getConversationDetail(OTHER_USER_ID, created.conversation.id)).toBeNull();
    expect(await appendUserMessage(OTHER_USER_ID, created.conversation.id, "cambia algo")).toBeNull();
  });

  t("mover a un proyecto y sacarla de él", async () => {
    const proj = await createProject(TEST_USER_ID, { name: `Mover ${Date.now()}`, description: "" });
    createdProjectIds.push(proj.id);
    const created = await createConversationWithRequest(TEST_USER_ID, "un led con resistencia");
    createdConversationIds.push(created.conversation.id);

    const assigned = await moveConversation(TEST_USER_ID, created.conversation.id, proj.id);
    expect(assigned!.projectId).toBe(proj.id);

    const restored = await moveConversation(TEST_USER_ID, created.conversation.id, null);
    expect(restored!.projectId).toBeNull();
  });

  t("mover a un proyecto ajeno no hace nada", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "otro divisor");
    createdConversationIds.push(created.conversation.id);

    expect(
      await moveConversation(TEST_USER_ID, created.conversation.id, "proyecto-que-no-es-mio"),
    ).toBeNull();
  });

  t("el snapshot lista las no asignadas", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor suelto");
    createdConversationIds.push(created.conversation.id);

    const snapshot = await getSnapshot(TEST_USER_ID);
    expect(snapshot.unassignedConversationIds).toContain(created.conversation.id);
    expect(snapshot.conversations.some((item) => item.id === created.conversation.id)).toBe(true);
  });
});

const runResult: AgentsRunResult = {
  verdict: { status: "accepted", reason: "all blocks within tolerance", best_iteration: 0 },
  normalized_spec: { blocks: [{ id: "block-1", type: "voltage_divider" }] },
  netlists: { "block-1": { path: "/tmp/circuit.cir", text: "* divisor\nR1 in out 1k\n" } },
  sim_results: { "block-1": { metrics: { v_out: 5.01 }, sim_error: null } },
  component_values: { "block-1": { r1: 1000, r2: 714 } },
  history: [{ iteration: 0, decision: "accept" }],
  iteration: 0,
};

describe("escritura del resultado (db)", () => {
  t("onResult cierra la ejecución, escribe el mensaje y los artefactos", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    const sink = makeDbSink(created.conversation.id, created.execution.id);
    await sink.onResult(runResult);

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.executionStatus).toBe("completed");
    expect(detail!.execution.summary).toBe("all blocks within tolerance");
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.messages[1]!.role).toBe("assistant");
    expect(detail!.messages[1]!.content).toContain("block-1.v_out = 5.01");
    expect(detail!.files).toHaveLength(1);
    expect(detail!.files[0]!.name).toBe("block-1.cir");
    expect(detail!.files[0]!.content).toContain("R1 in out 1k");
  });

  t("una corrida nueva reemplaza los artefactos, no los duplica", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    await makeDbSink(created.conversation.id, created.execution.id).onResult(runResult);
    const followUp = await appendUserMessage(TEST_USER_ID, created.conversation.id, "ahora a 3.3V");
    await makeDbSink(created.conversation.id, followUp!.execution.id).onResult(runResult);

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.files).toHaveLength(1);
  });

  t("onFailure marca la ejecución fallida con el resumen dado", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor");
    createdConversationIds.push(created.conversation.id);

    await makeDbSink(created.conversation.id, created.execution.id).onFailure("No pudimos ejecutar el diseño.");

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.executionStatus).toBe("failed");
    expect(detail!.execution.summary).toBe("No pudimos ejecutar el diseño.");
  });

  t("el barrido no toca una ejecución activa recién creada", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor reciente");
    createdConversationIds.push(created.conversation.id);

    await sweepStaleExecutions();

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.executionStatus).toBe("active");
  });
});
