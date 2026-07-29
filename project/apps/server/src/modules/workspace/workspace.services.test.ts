import { afterAll, describe, expect, test } from "bun:test";

import { createProject, deleteProject, getProjectDetail, listProjectViews } from "./workspace.services";

// Integración real contra la BD (Neon). Correr con:
//   RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test
const runDb = process.env.RUN_DB_TESTS === "1";
const t = test.skipIf(!runDb);

// Debe existir en la tabla `user` cuando se ejecuten los tests de BD.
const TEST_USER_ID = process.env.TEST_USER_ID ?? "test-user-00000000";
const OTHER_USER_ID = "test-user-ajeno";

const createdProjectIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdProjectIds) {
    await deleteProject(TEST_USER_ID, id).catch(() => {});
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
