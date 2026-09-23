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
  name: z.string().trim().min(1),
  description: z.string().default(""),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const renameConversationSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
});

export type RenameConversationInput = z.infer<typeof renameConversationSchema>;

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

import type { ExecutionStage } from "./workspace.runner";

export function deriveExecutionMode(
  latestExecution: ExecutionRow | undefined,
  artifactCount: number,
): "chat" | "clarify" | "design" {
  if (!latestExecution) return "chat";
  const verdict = latestExecution.verdict as { mode?: string; status?: string } | null;
  if (verdict?.mode === "chat") return "chat";
  if (verdict?.mode === "clarify") return "clarify";
  if (verdict?.status === "accepted" || verdict?.status === "rejected") return "design";
  if (artifactCount > 0 || latestExecution.normalizedSpec !== null) return "design";
  if (latestExecution.status === "active") return "design";
  return "chat";
}

export function deriveExecutionStages(
  latestExecution: ExecutionRow | undefined,
  artifacts: ArtifactRow[],
): ExecutionStage[] {
  if (!latestExecution) return [];

  const verdict = latestExecution.verdict as {
    mode?: string;
    status?: string;
    stages?: ExecutionStage[];
  } | null;

  if (verdict?.mode === "chat" || verdict?.mode === "clarify") {
    return [];
  }

  if (Array.isArray(verdict?.stages) && verdict.stages.length > 0) {
    return verdict.stages;
  }

  if (latestExecution.status === "active") {
    return [
      {
        id: `${latestExecution.id}-interpretation`,
        kind: "interpretation",
        label: "Interpretación",
        actor: "Orquestador",
        status: "active",
        durationMs: null,
        summary: latestExecution.summary || "Interpretando requerimientos...",
        metrics: [],
      },
      {
        id: `${latestExecution.id}-calculation`,
        kind: "calculation",
        label: "Cálculo",
        actor: "Cálculo",
        status: "pending",
        durationMs: null,
        summary: "Pendiente de interpretar restricciones.",
        metrics: [],
      },
      {
        id: `${latestExecution.id}-simulation`,
        kind: "simulation",
        label: "Simulación",
        actor: "Simulación",
        status: "pending",
        durationMs: null,
        summary: "Pendiente de calcular componentes.",
        metrics: [],
      },
      {
        id: `${latestExecution.id}-curation`,
        kind: "curation",
        label: "Curación",
        actor: "Curador",
        status: "pending",
        durationMs: null,
        summary: "Pendiente de simular circuito.",
        metrics: [],
      },
      {
        id: `${latestExecution.id}-result`,
        kind: "result",
        label: "Documentación",
        actor: "Documentador",
        status: "pending",
        durationMs: null,
        summary: "Pendiente de validación.",
        metrics: [],
      },
    ];
  }

  const isDesign =
    verdict?.status === "accepted" ||
    verdict?.status === "rejected" ||
    artifacts.length > 0 ||
    latestExecution.normalizedSpec !== null;

  if (isDesign) {
    const isCompleted = latestExecution.status === "completed";
    return [
      {
        id: `${latestExecution.id}-interpretation`,
        kind: "interpretation",
        label: "Interpretación",
        actor: "Orquestador",
        status: "completed",
        durationMs: 400,
        summary: "Interpretó la solicitud y normalizó las restricciones.",
        metrics: [],
      },
      {
        id: `${latestExecution.id}-calculation`,
        kind: "calculation",
        label: "Cálculo",
        actor: "Cálculo",
        status: "completed",
        durationMs: 800,
        summary: "Seleccionó valores para los componentes.",
        metrics: [],
      },
      {
        id: `${latestExecution.id}-simulation`,
        kind: "simulation",
        label: "Simulación",
        actor: "Simulación",
        status: "completed",
        durationMs: 1200,
        summary: "Ejecutó la simulación SPICE con NGSpice.",
        metrics: [],
      },
      {
        id: `${latestExecution.id}-curation`,
        kind: "curation",
        label: "Curación",
        actor: "Curador",
        status: isCompleted ? "completed" : "failed",
        durationMs: 600,
        summary: latestExecution.summary,
        metrics: [],
      },
      {
        id: `${latestExecution.id}-result`,
        kind: "result",
        label: "Documentación",
        actor: "Documentador",
        status: isCompleted ? "completed" : "failed",
        durationMs: 500,
        summary: isCompleted ? "Circuito validado y entregado." : "Ejecución finalizada con observaciones.",
        metrics: [],
      },
    ];
  }

  return [];
}

export function toConversationDetail(
  row: ConversationRow,
  messages: MessageRow[],
  artifacts: ArtifactRow[],
  latestExecution: ExecutionRow | undefined,
  stages?: ExecutionStage[],
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
      summary: item.summary,
      tags: item.tags,
      components: item.components,
      measurementExplanation: item.measurementExplanation,
    })),
    execution: (() => {
      const mode = deriveExecutionMode(latestExecution, artifacts.length);
      return {
        id: latestExecution?.id ?? `${row.id}-execution`,
        status: latestExecution?.status ?? ("failed" as const),
        summary: latestExecution?.summary ?? MISSING_EXECUTION_SUMMARY,
        mode,
        stages: mode === "chat" || mode === "clarify" ? [] : (stages ?? deriveExecutionStages(latestExecution, artifacts)),
      };
    })(),
  };
}

export type ConversationSummaryView = ReturnType<typeof toConversationSummary>;
export type ConversationDetailView = ReturnType<typeof toConversationDetail>;

