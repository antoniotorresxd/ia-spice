import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/db";

import { artifact, conversation, execution, message, project } from "./workspace.model";
import {
  deriveTitle,
  toConversationDetail,
  toConversationSummary,
  type ConversationSummaryView,
  type CreateProjectInput,
} from "./workspace.schemas";
import { composeRequestText } from "./workspace.context";
import {
  mapVerdictToStatus,
  toArtifactDrafts,
  toAssistantMessage,
  type AgentsRunResult,
  type RunSink,
} from "./workspace.runner";

export async function createProject(userId: string, input: CreateProjectInput) {
  const [row] = await db
    .insert(project)
    .values({ userId, name: input.name, description: input.description })
    .returning();
  return row!;
}

export async function deleteProject(userId: string, id: string) {
  const [row] = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .returning();
  return row ?? null;
}

// Cuenta artefactos por proyecto en una sola consulta. Los artefactos cuelgan
// de la conversación, así que basta un join; no hace falta localizar la última
// ejecución de cada una.
async function countArtifactsByProject(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      projectId: conversation.projectId,
      total: sql<number>`count(${artifact.id})::int`,
    })
    .from(conversation)
    .leftJoin(artifact, eq(artifact.conversationId, conversation.id))
    .where(eq(conversation.userId, userId))
    .groupBy(conversation.projectId);

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.projectId) counts.set(row.projectId, row.total);
  }
  return counts;
}

export type ProjectView = {
  id: string;
  name: string;
  description: string;
  conversationIds: string[];
  fileCount: number;
  updatedAt: string;
};

export async function listProjectViews(userId: string): Promise<ProjectView[]> {
  const [projects, conversations, fileCounts] = await Promise.all([
    db.select().from(project).where(eq(project.userId, userId)).orderBy(desc(project.updatedAt)),
    db
      .select({ id: conversation.id, projectId: conversation.projectId })
      .from(conversation)
      .where(eq(conversation.userId, userId))
      .orderBy(desc(conversation.updatedAt)),
    countArtifactsByProject(userId),
  ]);

  return projects.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    conversationIds: conversations
      .filter((item) => item.projectId === row.id)
      .map((item) => item.id),
    fileCount: fileCounts.get(row.id) ?? 0,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getProjectDetail(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);
  if (!row) return null;

  const views = await listProjectViews(userId);
  const view = views.find((item) => item.id === id)!;
  const summaries = await listConversationSummaries(userId);

  return {
    ...view,
    conversations: view.conversationIds
      .map((conversationId) => summaries.find((item) => item.id === conversationId))
      .filter((item): item is ConversationSummaryView => item !== undefined),
  };
}

// Resumen de todas las conversaciones del usuario. Se reduce en memoria a
// propósito: el volumen es el de una cuenta, no el de un catálogo, y evita una
// función de ventana por cada campo derivado.
export async function listConversationSummaries(
  userId: string,
): Promise<ConversationSummaryView[]> {
  const conversations = await db
    .select()
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt));

  if (conversations.length === 0) return [];

  const ids = conversations.map((row) => row.id);
  const [messages, executions] = await Promise.all([
    db
      .select()
      .from(message)
      .where(inArray(message.conversationId, ids))
      .orderBy(asc(message.createdAt)),
    db
      .select()
      .from(execution)
      .where(inArray(execution.conversationId, ids))
      .orderBy(asc(execution.startedAt)),
  ]);

  return conversations.map((row) => {
    const own = messages.filter((item) => item.conversationId === row.id);
    const runs = executions.filter((item) => item.conversationId === row.id);
    return toConversationSummary(row, own.at(-1), runs.at(-1));
  });
}

const ACTIVE_SUMMARY = "Diseño en progreso";

// El driver neon-http no soporta transacciones interactivas: hacen falta los
// ids devueltos por cada INSERT, así que van secuenciales. Si el proceso muere
// en medio, toConversationDetail sintetiza una ejecución fallida.
export async function createConversationWithRequest(userId: string, text: string) {
  const [conversationRow] = await db
    .insert(conversation)
    .values({ userId, projectId: null, title: deriveTitle(text) })
    .returning();

  const [messageRow] = await db
    .insert(message)
    .values({ conversationId: conversationRow!.id, role: "user", content: text })
    .returning();

  const [executionRow] = await db
    .insert(execution)
    .values({
      conversationId: conversationRow!.id,
      status: "active",
      summary: ACTIVE_SUMMARY,
      requestText: text,
    })
    .returning();

  return {
    conversation: conversationRow!,
    message: messageRow!,
    execution: executionRow!,
    requestText: text,
  };
}

export async function deleteConversation(userId: string, id: string) {
  const [row] = await db
    .delete(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .returning();
  return row ?? null;
}

async function loadConversationParts(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .limit(1);
  if (!row) return null;

  const [messages, artifacts, executions] = await Promise.all([
    db.select().from(message).where(eq(message.conversationId, id)).orderBy(asc(message.createdAt)),
    db.select().from(artifact).where(eq(artifact.conversationId, id)).orderBy(asc(artifact.name)),
    db
      .select()
      .from(execution)
      .where(eq(execution.conversationId, id))
      .orderBy(desc(execution.startedAt))
      .limit(1),
  ]);

  return { row, messages, artifacts, latestExecution: executions.at(0) };
}

export async function getConversationDetail(userId: string, id: string) {
  await sweepStaleExecutions();
  const parts = await loadConversationParts(userId, id);
  if (!parts) return null;
  return toConversationDetail(parts.row, parts.messages, parts.artifacts, parts.latestExecution);
}

// Un seguimiento: mensaje del usuario, ejecución nueva, y el request_text
// compuesto con el contexto de la conversación.
export async function appendUserMessage(userId: string, id: string, text: string) {
  const parts = await loadConversationParts(userId, id);
  if (!parts) return null;

  const requestText = composeRequestText(
    parts.messages.map((item) => ({ role: item.role, content: item.content })),
    parts.latestExecution?.normalizedSpec ?? null,
    text,
  );

  const [messageRow] = await db
    .insert(message)
    .values({ conversationId: id, role: "user", content: text })
    .returning();

  const [executionRow] = await db
    .insert(execution)
    .values({
      conversationId: id,
      status: "active",
      summary: ACTIVE_SUMMARY,
      requestText,
    })
    .returning();

  await db.update(conversation).set({ updatedAt: new Date() }).where(eq(conversation.id, id));

  return { message: messageRow!, execution: executionRow!, requestText };
}

// Cubre assignConversation y restoreConversationProject: ambas mueven la
// conversación a un proyecto o a ninguno. Devuelve null si la conversación o el
// proyecto destino no son de este usuario.
export async function moveConversation(
  userId: string,
  id: string,
  projectId: string | null,
): Promise<ConversationSummaryView | null> {
  if (projectId !== null) {
    const [owned] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.userId, userId)))
      .limit(1);
    if (!owned) return null;
  }

  const [row] = await db
    .update(conversation)
    .set({ projectId, updatedAt: new Date() })
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .returning();
  if (!row) return null;

  const parts = await loadConversationParts(userId, id);
  return toConversationSummary(row, parts?.messages.at(-1), parts?.latestExecution);
}

export async function getSnapshot(userId: string) {
  await sweepStaleExecutions();
  const [projects, conversations] = await Promise.all([
    listProjectViews(userId),
    listConversationSummaries(userId),
  ]);

  return {
    projects,
    conversations,
    unassignedConversationIds: conversations
      .filter((item) => item.projectId === null)
      .map((item) => item.id),
  };
}

const STALE_RUN_MS = 10 * 60 * 1000;
const STALE_RUN_SUMMARY = "La ejecución se interrumpió antes de terminar.";

// El server corre con `bun run --hot` y se reinicia en cada guardado, lo que
// deja ejecuciones colgadas en 'active' para siempre. Este barrido las cierra.
// Es global, no por usuario: una lectura de cualquiera limpia las de todos, que
// es lo correcto para una operación de mantenimiento.
export async function sweepStaleExecutions(): Promise<void> {
  await db
    .update(execution)
    .set({ status: "failed", summary: STALE_RUN_SUMMARY, finishedAt: new Date() })
    .where(
      and(
        eq(execution.status, "active"),
        lt(execution.startedAt, new Date(Date.now() - STALE_RUN_MS)),
      ),
    );
}

// El sumidero real: traduce el resultado del grafo a filas. Se mantiene aparte
// de startRun para que el camino de red se pruebe sin base de datos.
export function makeDbSink(conversationId: string, executionId: string): RunSink {
  return {
    async onResult(result: AgentsRunResult) {
      const { status, summary } = mapVerdictToStatus(result.verdict);

      await db.insert(message).values({
        conversationId,
        role: "assistant",
        content: toAssistantMessage(result),
      });

      // Los artefactos se reemplazan: son el netlist vigente, no un histórico.
      await db.delete(artifact).where(eq(artifact.conversationId, conversationId));
      const drafts = toArtifactDrafts(result);
      if (drafts.length > 0) {
        await db
          .insert(artifact)
          .values(drafts.map((draft) => ({ conversationId, ...draft })));
      }

      await db
        .update(execution)
        .set({
          status,
          summary,
          verdict: result.verdict,
          normalizedSpec: result.normalized_spec,
          history: result.history,
          finishedAt: new Date(),
        })
        .where(eq(execution.id, executionId));

      await db
        .update(conversation)
        .set({ updatedAt: new Date() })
        .where(eq(conversation.id, conversationId));
    },

    async onFailure(summary: string) {
      await db
        .update(execution)
        .set({ status: "failed", summary, finishedAt: new Date() })
        .where(eq(execution.id, executionId));

      await db
        .update(conversation)
        .set({ updatedAt: new Date() })
        .where(eq(conversation.id, conversationId));
    },
  };
}
