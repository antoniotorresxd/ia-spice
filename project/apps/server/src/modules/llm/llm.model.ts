import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../auth/auth.model";

export const LLM_PROVIDERS = ["anthropic", "openai", "google", "openai_compatible"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

// Los agentes que pueden tener un LLM asignado. `shell` no aparece: ejecuta
// ngspice, no consume un modelo.
export const AGENT_IDS = ["orchestrator", "calculation", "writer", "curator"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const TEST_STATUSES = ["ok", "failed"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

// La credencial. No lleva modelo: el modelo es del agente, no de la cuenta.
export const llmConnection = pgTable(
  "llm_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    provider: text("provider", { enum: LLM_PROVIDERS }).notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    keyHint: text("key_hint"), // últimos 4 chars de la key, para la UI
    baseUrl: text("base_url"),
    lastTestedAt: timestamp("last_tested_at"),
    lastTestStatus: text("last_test_status", { enum: TEST_STATUSES }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("llm_connection_userId_idx").on(table.userId),
    uniqueIndex("llm_connection_userId_label_idx").on(table.userId, table.label),
  ],
);

// Qué conexión y qué modelo usa cada agente. Se materializa perezosamente:
// un agente sin fila se reporta como {connectionId: null, model: ""}.
export const agentLlmAssignment = pgTable(
  "agent_llm_assignment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id", { enum: AGENT_IDS }).notNull(),
    // SET NULL y no CASCADE: borrar una conexión desasigna al agente, que es
    // justo lo que el diálogo de borrado de la UI le promete al usuario.
    connectionId: text("connection_id").references(() => llmConnection.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_llm_assignment_userId_agentId_idx").on(table.userId, table.agentId),
    index("agent_llm_assignment_connectionId_idx").on(table.connectionId),
  ],
);
