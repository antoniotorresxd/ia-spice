import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { createRouter } from "@/lib/create-app";
import env from "@/lib/env";

import { createCircuitKnowledgeSchema } from "./circuit.schemas";
import {
  getCircuitById,
  listCircuits,
  seedCircuitKnowledge,
  upsertCircuit,
} from "./circuit.services";

function isValidServiceToken(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(env.AGENTS_SERVICE_TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export const circuitRouter = createRouter()
  .get("/api/circuits", async (c) => {
    const category = c.req.query("category");
    const rows = await listCircuits(category);
    return c.json(rows);
  })
  .get("/api/circuits/:id", async (c) => {
    const id = c.req.param("id");
    const row = await getCircuitById(id);
    if (!row) {
      return c.json({ error: "circuit_not_found" }, 404);
    }
    return c.json(row);
  })
  .get("/api/internal/circuits", async (c) => {
    if (!isValidServiceToken(c.req.header("Authorization"))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const category = c.req.query("category");
    const rows = await listCircuits(category);
    return c.json(rows);
  })
  .get("/api/internal/circuits/:id", async (c) => {
    if (!isValidServiceToken(c.req.header("Authorization"))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const row = await getCircuitById(id);
    if (!row) {
      return c.json({ error: "circuit_not_found" }, 404);
    }
    return c.json(row);
  })
  .post("/api/internal/circuits", async (c) => {
    if (!isValidServiceToken(c.req.header("Authorization"))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const parsed = createCircuitKnowledgeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await upsertCircuit(parsed.data);
    return c.json(row, 201);
  })
  .post("/api/internal/circuits/seed", async (c) => {
    if (!isValidServiceToken(c.req.header("Authorization"))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const result = await seedCircuitKnowledge();
    return c.json(result);
  });
