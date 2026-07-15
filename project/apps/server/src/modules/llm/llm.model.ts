import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const LLM_PROVIDERS = ["anthropic", "openai", "google", "openai_compatible"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const llmConfig = pgTable(
  "llm_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text("label").notNull().unique(),
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
    // la BD garantiza que nunca haya dos configuraciones activas
    uniqueIndex("llm_config_single_active_idx")
      .on(table.isActive)
      .where(sql`${table.isActive} = true`),
  ],
);
