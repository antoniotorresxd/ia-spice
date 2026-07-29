import { z } from "zod";

import { AGENT_IDS, LLM_PROVIDERS, type llmConnection } from "./llm.model";

export const providerSchema = z.enum(LLM_PROVIDERS);
export const agentIdSchema = z.enum(AGENT_IDS);

export const createConnectionSchema = z
  .object({
    label: z.string().min(1),
    provider: providerSchema,
    apiKey: z.string().min(1).optional(),
    baseUrl: z.url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "openai_compatible") {
      if (!data.baseUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["baseUrl"],
          message: "baseUrl is required for openai_compatible",
        });
      }
    } else if (!data.apiKey) {
      ctx.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: `apiKey is required for provider ${data.provider}`,
      });
    }
  });

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const updateConnectionSchema = z.object({
  label: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.url().nullable().optional(),
});

export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;

// connectionId nulo desasigna al agente; model vacío es válido.
export const updateAssignmentSchema = z.object({
  connectionId: z.string().min(1).nullable(),
  model: z.string(),
});

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

type ConnectionRow = typeof llmConnection.$inferSelect;

// vista pública: jamás incluye la key (ni cifrada ni en claro)
export function toPublicConnection(row: ConnectionRow) {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    baseUrl: row.baseUrl,
    hasKey: row.apiKeyEncrypted !== null,
    keyHint: row.keyHint,
    lastTestedAt: row.lastTestedAt,
    lastTestStatus: row.lastTestStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
