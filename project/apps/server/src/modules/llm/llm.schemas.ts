import { z } from "zod";

import { LLM_PROVIDERS, type llmConfig } from "./llm.model";

export const providerSchema = z.enum(LLM_PROVIDERS);

export const createLlmConfigSchema = z
  .object({
    label: z.string().min(1),
    provider: providerSchema,
    model: z.string().min(1),
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

export type CreateLlmConfigInput = z.infer<typeof createLlmConfigSchema>;

export const updateLlmConfigSchema = z.object({
  label: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.url().nullable().optional(),
});

export type UpdateLlmConfigInput = z.infer<typeof updateLlmConfigSchema>;

type LlmConfigRow = typeof llmConfig.$inferSelect;

// vista pública: jamás incluye la key (ni cifrada ni en claro)
export function toPublicLlmConfig(row: LlmConfigRow) {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    isActive: row.isActive,
    hasKey: row.apiKeyEncrypted !== null,
    keyHint: row.keyHint,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
