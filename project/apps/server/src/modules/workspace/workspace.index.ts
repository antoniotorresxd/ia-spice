import { z } from "zod";

import { streamSSE } from "hono/streaming";

import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/session";

import { startRun } from "./workspace.runner";
import {
  createProjectSchema,
  moveConversationSchema,
  renameConversationSchema,
  submitTextSchema,
  updateProjectSchema,
} from "./workspace.schemas";
import {
  appendUserMessage,
  createConversationWithRequest,
  createProject,
  deleteConversation,
  deleteProject,
  getConversationDetail,
  getConversationTrace,
  getProjectDetail,
  getSnapshot,
  listUserFiles,
  makeDbSink,
  moveConversation,
  renameConversation,
  subscribeConversationEvents,
  updateProject,
} from "./workspace.services";

export const workspaceRouter = createRouter()
  .get("/api/workspace/snapshot", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    return c.json(await getSnapshot(userId));
  })
  .get("/api/workspace/projects/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const detail = await getProjectDetail(userId, c.req.param("id"));
    if (!detail) return c.json({ error: "Not Found" }, 404);
    return c.json(detail);
  })
  .post("/api/workspace/projects", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await createProject(userId, parsed.data);
    return c.json(
      {
        id: row.id,
        name: row.name,
        description: row.description,
        conversationIds: [],
        fileCount: 0,
        updatedAt: row.updatedAt.toISOString(),
      },
      201,
    );
  })
  .patch("/api/workspace/projects/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = updateProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const updated = await updateProject(userId, c.req.param("id"), parsed.data);
    if (!updated) return c.json({ error: "Not Found" }, 404);
    return c.json(updated);
  })
  .get("/api/workspace/conversations/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const detail = await getConversationDetail(userId, c.req.param("id"));
    // 404 y no 403 para una conversación ajena: no se confirma que exista.
    if (!detail) return c.json({ error: "Not Found" }, 404);
    return c.json(detail);
  })
  .get("/api/workspace/conversations/:id/trace", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const result = await getConversationTrace(userId, c.req.param("id"));
    if (!result) return c.json({ error: "Not Found" }, 404);
    return c.json(result);
  })
  .get("/api/workspace/conversations/:id/events", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const conversationId = c.req.param("id");
    const detail = await getConversationDetail(userId, conversationId);
    if (!detail) return c.json({ error: "Not Found" }, 404);

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "init",
        data: JSON.stringify({
          status: detail.execution.status,
          stages: detail.execution.stages,
        }),
      });

      if (detail.execution.status !== "active") {
        return;
      }

      const unsubscribe = subscribeConversationEvents(conversationId, async (event) => {
        try {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
          });
        } catch {
          // stream connection closed
        }
      });

      stream.onAbort(() => {
        unsubscribe();
      });

      while (!stream.aborted) {
        await stream.sleep(15000);
        try {
          await stream.writeSSE({ event: "ping", data: "" });
        } catch {
          break;
        }
      }
      unsubscribe();
    });
  })
  .patch("/api/workspace/conversations/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = renameConversationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const updated = await renameConversation(userId, c.req.param("id"), parsed.data.title);
    if (!updated) return c.json({ error: "Not Found" }, 404);
    return c.json(updated);
  })
  .post("/api/workspace/conversations", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = submitTextSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }

    const created = await createConversationWithRequest(userId, parsed.data.text);

    // Sin await: la corrida puede tardar decenas de segundos y la respuesta
    // sale ya. El client sondea hasta ver la ejecución cerrada.
    void startRun(
      {
        userId,
        requestText: created.requestText,
        executionId: created.execution.id,
        maxIterations: parsed.data.maxIterations,
        tolerance: parsed.data.tolerance,
      },
      makeDbSink(created.conversation.id, created.execution.id),
    );

    const detail = await getConversationDetail(userId, created.conversation.id);
    return c.json(detail!, 201);
  })
  .post("/api/workspace/conversations/:id/messages", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const conversationId = c.req.param("id");
    const parsed = submitTextSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }

    const appended = await appendUserMessage(userId, conversationId, parsed.data.text);
    if (!appended) return c.json({ error: "Not Found" }, 404);

    void startRun(
      {
        userId,
        requestText: appended.requestText,
        executionId: appended.execution.id,
        maxIterations: parsed.data.maxIterations,
        tolerance: parsed.data.tolerance,
      },
      makeDbSink(conversationId, appended.execution.id, appended.previousNormalizedSpec),
    );

    const detail = await getConversationDetail(userId, conversationId);
    return c.json(detail!);
  })
  // Una sola ruta para assignConversation y restoreConversationProject: mover
  // la conversación a un proyecto o a ninguno es la misma operación.
  .patch("/api/workspace/conversations/:id/project", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = moveConversationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const summary = await moveConversation(userId, c.req.param("id"), parsed.data.projectId);
    if (!summary) return c.json({ error: "Not Found" }, 404);
    return c.json(summary);
  })
  .delete("/api/workspace/projects/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const deleted = await deleteProject(userId, c.req.param("id"));
    if (!deleted) return c.json({ error: "Not Found" }, 404);
    return c.json({ success: true, id: deleted.id });
  })
  .delete("/api/workspace/conversations/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const deleted = await deleteConversation(userId, c.req.param("id"));
    if (!deleted) return c.json({ error: "Not Found" }, 404);
    return c.json({ success: true, id: deleted.id });
  })
  .get("/api/workspace/files", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    return c.json(await listUserFiles(userId));
  });
