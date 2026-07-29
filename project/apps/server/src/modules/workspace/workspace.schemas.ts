import { z } from "zod";

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
