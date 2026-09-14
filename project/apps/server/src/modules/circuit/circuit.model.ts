import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export interface ParameterSpec {
  type: string;
  unit?: string;
  description: string;
  default?: unknown;
  required?: boolean;
}

export interface NumericalExampleData {
  specs: Record<string, unknown>;
  computed: Record<string, unknown>;
  expected?: Record<string, unknown>;
}

export const circuitKnowledge = pgTable("circuit_knowledge", {
  id: text("id").primaryKey(), // slug único e.g. "rc_lowpass_passive"
  name: text("name").notNull(),
  category: text("category").notNull(), // "filtros", "polarizacion_bjt", "diodos", "divisores", "opamp"
  description: text("description").notNull(),
  topologySummary: text("topology_summary").notNull(),
  parametersSchema: jsonb("parameters_schema")
    .notNull()
    .$type<Record<string, ParameterSpec>>(),
  operatingConstraints: text("operating_constraints").notNull(),
  designEquations: text("design_equations").notNull(),
  spiceTemplate: text("spice_template").notNull(),
  numericalExample: jsonb("numerical_example").$type<NumericalExampleData>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type CircuitKnowledge = typeof circuitKnowledge.$inferSelect;
export type NewCircuitKnowledge = typeof circuitKnowledge.$inferInsert;
