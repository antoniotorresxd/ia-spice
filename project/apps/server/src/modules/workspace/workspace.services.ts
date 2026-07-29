import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";

import { artifact, conversation, execution, message, project } from "./workspace.model";
import {
  toConversationSummary,
  type ConversationSummaryView,
  type CreateProjectInput,
} from "./workspace.schemas";

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
