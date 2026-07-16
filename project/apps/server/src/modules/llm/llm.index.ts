import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { createRouter } from "@/lib/create-app";
import env from "@/lib/env";
import { requireAuth } from "@/middleware/session";

import {
  createLlmConfigSchema,
  toPublicLlmConfig,
  updateLlmConfigSchema,
} from "./llm.schemas";
import {
  activateLlmConfig,
  createLlmConfig,
  deleteLlmConfig,
  getActiveLlmResolved,
  listLlmConfigs,
  updateLlmConfig,
} from "./llm.services";

export const llmRouter = createRouter();

llmRouter.use("/api/llm", requireAuth);
llmRouter.use("/api/llm/*", requireAuth);

llmRouter.get("/api/llm", async (c) => {
  const { id: userId } = c.get("user")!;
  const rows = await listLlmConfigs(userId);
  return c.json(rows.map(toPublicLlmConfig));
});

llmRouter.post("/api/llm", async (c) => {
  const { id: userId } = c.get("user")!;
  const parsed = createLlmConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: z.treeifyError(parsed.error) }, 400);
  }
  const row = await createLlmConfig(userId, parsed.data);
  return c.json(toPublicLlmConfig(row), 201);
});

llmRouter.patch("/api/llm/:id", async (c) => {
  const { id: userId } = c.get("user")!;
  const parsed = updateLlmConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: z.treeifyError(parsed.error) }, 400);
  }
  const row = await updateLlmConfig(userId, c.req.param("id"), parsed.data);
  if (!row) return c.json({ error: "Not Found" }, 404);
  return c.json(toPublicLlmConfig(row));
});

llmRouter.delete("/api/llm/:id", async (c) => {
  const { id: userId } = c.get("user")!;
  const row = await deleteLlmConfig(userId, c.req.param("id"));
  if (!row) return c.json({ error: "Not Found" }, 404);
  return c.json({ deleted: row.id });
});

llmRouter.post("/api/llm/:id/activate", async (c) => {
  const { id: userId } = c.get("user")!;
  const id = c.req.param("id");
  // Check existence BEFORE activating: activateLlmConfig deactivates the
  // current active row before resolving the target, so a bogus id would
  // otherwise knock out the active config.
  const existing = await listLlmConfigs(userId);
  if (!existing.some((r) => r.id === id)) {
    return c.json({ error: "Not Found" }, 404);
  }
  const row = await activateLlmConfig(userId, id);
  if (!row) return c.json({ error: "Not Found" }, 404);
  const catalog = await listLlmConfigs(userId);
  return c.json({
    active: toPublicLlmConfig(row),
    catalog: catalog.map(toPublicLlmConfig),
  });
});

function isValidServiceToken(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(env.AGENTS_SERVICE_TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

// Endpoint interno consumido por el servicio de agents Python.
// El userId se recibe como query param; está protegido por el service token.
llmRouter.get("/api/internal/llm/active", async (c) => {
  if (!isValidServiceToken(c.req.header("authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param is required" }, 400);
  }
  const active = await getActiveLlmResolved(userId);
  if (!active) {
    return c.json({ error: "No active LLM configured" }, 404);
  }
  return c.json(active);
});
