import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../auth/auth.model";

export const LLM_PROVIDERS = ["anthropic", "openai", "google", "openai_compatible"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const llmConfig = pgTable(
  "llm_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    provider: text("provider", { enum: LLM_PROVIDERS }).notNull(),
    model: text("model").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    keyHint: text("key_hint"), // últimos 4 chars de la key, para la UI
    baseUrl: text("base_url"),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // índice para listar configs por usuario
    index("llm_config_userId_idx").on(table.userId),
    // label único por usuario (no globalmente)
    uniqueIndex("llm_config_userId_label_idx").on(table.userId, table.label),
    // cada usuario puede tener exactamente una config activa
    uniqueIndex("llm_config_userId_active_idx")
      .on(table.userId, table.isActive)
      .where(sql`${table.isActive} = true`),
  ],
);
