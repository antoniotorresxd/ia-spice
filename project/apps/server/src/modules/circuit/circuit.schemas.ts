import { z } from "zod";

export const parameterSpecSchema = z.object({
  type: z.string(),
  unit: z.string().optional(),
  description: z.string(),
  default: z.unknown().optional(),
  required: z.boolean().optional(),
});

export const numericalExampleSchema = z.object({
  specs: z.record(z.string(), z.unknown()),
  computed: z.record(z.string(), z.unknown()),
  expected: z.record(z.string(), z.unknown()).optional(),
});

export const circuitKnowledgeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  topologySummary: z.string(),
  parametersSchema: z.record(z.string(), parameterSpecSchema),
});

export type CircuitKnowledgeSummary = z.infer<typeof circuitKnowledgeSummarySchema>;

export const circuitKnowledgeDetailSchema = circuitKnowledgeSummarySchema.extend({
  operatingConstraints: z.string(),
  designEquations: z.string(),
  spiceTemplate: z.string(),
  numericalExample: numericalExampleSchema.nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CircuitKnowledgeDetail = z.infer<typeof circuitKnowledgeDetailSchema>;

export const createCircuitKnowledgeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  topologySummary: z.string().min(1),
  parametersSchema: z.record(z.string(), parameterSpecSchema),
  operatingConstraints: z.string().min(1),
  designEquations: z.string().min(1),
  spiceTemplate: z.string().min(1),
  numericalExample: numericalExampleSchema.optional(),
});

export type CreateCircuitKnowledgeInput = z.infer<typeof createCircuitKnowledgeSchema>;
