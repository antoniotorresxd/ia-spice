import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { createRouter } from "@/lib/create-app";
import env from "@/lib/env";
import { requireAuth } from "@/middleware/session";

import { AGENT_IDS, type AgentId } from "./llm.model";
import { probeConnection } from "./llm.providers";
import {
  agentIdSchema,
  createConnectionSchema,
  toPublicConnection,
  updateAssignmentSchema,
  updateConnectionSchema,
} from "./llm.schemas";
import {
  createConnection,
  deleteConnection,
  getAgentLlmResolved,
  getConnection,
  getConnectionCredentials,
  listAssignments,
  listConnections,
  recordConnectionTest,
  updateConnection,
  upsertAssignment,
} from "./llm.services";

function isValidServiceToken(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(env.AGENTS_SERVICE_TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

export const llmRouter = createRouter()
  .get("/api/llm/connections", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const rows = await listConnections(userId);
    return c.json(rows.map(toPublicConnection));
  })
  .post("/api/llm/connections", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = createConnectionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await createConnection(userId, parsed.data);
    return c.json(toPublicConnection(row), 201);
  })
  .patch("/api/llm/connections/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = updateConnectionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await updateConnection(userId, c.req.param("id"), parsed.data);
    if (!row) return c.json({ error: "Not Found" }, 404);
    return c.json(toPublicConnection(row));
  })
  .delete("/api/llm/connections/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const row = await deleteConnection(userId, c.req.param("id"));
    if (!row) return c.json({ error: "Not Found" }, 404);
    return c.json({ deleted: row.id });
  })
  .post("/api/llm/connections/:id/test", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const row = await getConnection(userId, c.req.param("id"));
    if (!row) return c.json({ error: "Not Found" }, 404);

    // La key se descifra aquí y no sale del server: la sonda solo la usa
    // para armar el header.
    const credentials = await getConnectionCredentials(userId, row.id);
    const result = await probeConnection({
      provider: row.provider,
      apiKey: credentials?.apiKey ?? null,
      baseUrl: row.baseUrl,
    });

    await recordConnectionTest(userId, row.id, result.ok ? "ok" : "failed");
    // 200 siempre: es un diagnóstico, no un fallo de la petición.
    return c.json(result);
  })
  .get("/api/llm/assignments", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    return c.json(await listAssignments(userId));
  })
  .put("/api/llm/assignments/:agentId", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const agentId = agentIdSchema.safeParse(c.req.param("agentId"));
    if (!agentId.success) {
      return c.json({ error: "Unknown agentId" }, 400);
    }
    const parsed = updateAssignmentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await upsertAssignment(userId, agentId.data, parsed.data);
    if (!row) return c.json({ error: "Connection Not Found" }, 404);
    return c.json(row);
  })
  // Endpoint interno consumido por agents. El userId viaja como query param;
  // está protegido por el service token.
  .get("/api/internal/llm/agent/:agentId", async (c) => {
    if (!isValidServiceToken(c.req.header("authorization"))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const agentId = c.req.param("agentId");
    if (!isAgentId(agentId)) {
      return c.json({ error: "Unknown agentId" }, 400);
    }
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ error: "userId query param is required" }, 400);
    }
    const resolved = await getAgentLlmResolved(userId, agentId);
    if (!resolved) {
      return c.json({ error: "No LLM configured for this agent" }, 404);
    }
    return c.json(resolved);
  });
