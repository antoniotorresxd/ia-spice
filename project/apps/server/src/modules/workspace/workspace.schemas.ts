import { z } from "zod";

import type { artifact, conversation, execution, message } from "./workspace.model";

export const TITLE_MAX = 80;
export const PREVIEW_MAX = 120;

// Normaliza espacios antes de medir: un título con saltos de línea rompe el
// layout de la UI y falsea la longitud.
export function truncate(value: string, max: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function deriveTitle(firstUserText: string): string {
  return truncate(firstUserText, TITLE_MAX);
}

export function derivePreview(lastMessageContent: string): string {
  return truncate(lastMessageContent, PREVIEW_MAX);
}

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const submitTextSchema = z.object({
  text: z.string().trim().min(1),
});

export type SubmitTextInput = z.infer<typeof submitTextSchema>;

// null saca la conversación de su proyecto; la cadena vacía no es un id.
export const moveConversationSchema = z.object({
  projectId: z.string().min(1).nullable(),
});

export type MoveConversationInput = z.infer<typeof moveConversationSchema>;

type ConversationRow = typeof conversation.$inferSelect;
type MessageRow = typeof message.$inferSelect;
type ExecutionRow = typeof execution.$inferSelect;
type ArtifactRow = typeof artifact.$inferSelect;

// El driver neon-http no soporta transacciones interactivas, así que crear una
// conversación son tres INSERT seguidos. Si el proceso muere en medio, la
// conversación queda sin ejecución: se reporta como fallida en lugar de
// reventar la pantalla.
const MISSING_EXECUTION_SUMMARY = "La ejecución no se pudo registrar.";

export function toConversationSummary(
  row: ConversationRow,
  lastMessage: MessageRow | undefined,
  latestExecution: ExecutionRow | undefined,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    preview: lastMessage ? derivePreview(lastMessage.content) : "",
    updatedAt: row.updatedAt.toISOString(),
    executionStatus: latestExecution?.status ?? ("failed" as const),
  };
}

export function toConversationDetail(
  row: ConversationRow,
  messages: MessageRow[],
  artifacts: ArtifactRow[],
  latestExecution: ExecutionRow | undefined,
) {
  return {
    ...toConversationSummary(row, messages.at(-1), latestExecution),
    messages: messages.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt.toISOString(),
    })),
    files: artifacts.map((item) => ({
      id: item.id,
      name: item.name,
      language: item.language,
      content: item.content,
      status: item.status,
    })),
    execution: {
      id: latestExecution?.id ?? `${row.id}-execution`,
      status: latestExecution?.status ?? ("failed" as const),
      summary: latestExecution?.summary ?? MISSING_EXECUTION_SUMMARY,
    },
  };
}

export type ConversationSummaryView = ReturnType<typeof toConversationSummary>;
export type ConversationDetailView = ReturnType<typeof toConversationDetail>;
