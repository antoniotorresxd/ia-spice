import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth/auth.model";

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const EXECUTION_STATUSES = ["active", "completed", "failed"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const ARTIFACT_STATUSES = ["complete", "partial"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const project = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_userId_idx").on(table.userId)],
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // SET NULL y no CASCADE: borrar un proyecto no debe borrar las
    // conversaciones que contenía, solo dejarlas sin proyecto.
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("conversation_userId_idx").on(table.userId),
    index("conversation_projectId_idx").on(table.projectId),
  ],
);

export const message = pgTable(
  "message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role", { enum: MESSAGE_ROLES }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("message_conversationId_idx").on(table.conversationId)],
);

// Una corrida del grafo. `history` guarda la traza que el curador ya emite
// (una fila por iteración con valores, métricas, evaluación y decisión); hoy
// nadie la lee, es el dataset de la política de RL que viene después.
export const execution = pgTable(
  "execution",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    status: text("status", { enum: EXECUTION_STATUSES }).notNull(),
    summary: text("summary").notNull().default(""),
    requestText: text("request_text").notNull(),
    verdict: jsonb("verdict"),
    normalizedSpec: jsonb("normalized_spec"),
    history: jsonb("history"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [index("execution_conversationId_idx").on(table.conversationId)],
);

// El netlist. Cuelga de la conversación, no de la ejecución: una corrida que
// termina reemplaza el conjunto entero, así que mientras una corrida está
// activa siguen viéndose los artefactos de la anterior.
export const artifact = pgTable(
  "artifact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    blockId: text("block_id").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    content: text("content").notNull(),
    status: text("status", { enum: ARTIFACT_STATUSES }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("artifact_conversationId_idx").on(table.conversationId)],
);
