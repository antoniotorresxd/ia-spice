CREATE TABLE "agent_llm_assignment" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"connection_id" text,
	"model" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_connection" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"provider" text NOT NULL,
	"api_key_encrypted" text,
	"key_hint" text,
	"base_url" text,
	"last_tested_at" timestamp,
	"last_test_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "llm_config";--> statement-breakpoint
CREATE UNIQUE INDEX "agent_llm_assignment_userId_agentId_idx" ON "agent_llm_assignment" ("user_id","agent_id");--> statement-breakpoint
CREATE INDEX "agent_llm_assignment_connectionId_idx" ON "agent_llm_assignment" ("connection_id");--> statement-breakpoint
CREATE INDEX "llm_connection_userId_idx" ON "llm_connection" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_connection_userId_label_idx" ON "llm_connection" ("user_id","label");--> statement-breakpoint
ALTER TABLE "agent_llm_assignment" ADD CONSTRAINT "agent_llm_assignment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_llm_assignment" ADD CONSTRAINT "agent_llm_assignment_connection_id_llm_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "llm_connection"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "llm_connection" ADD CONSTRAINT "llm_connection_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;