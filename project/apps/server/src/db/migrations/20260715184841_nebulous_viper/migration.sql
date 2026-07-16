ALTER TABLE "llm_config" DROP CONSTRAINT "llm_config_label_key";--> statement-breakpoint
DROP INDEX "llm_config_single_active_idx";--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX "llm_config_userId_idx" ON "llm_config" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_config_userId_label_idx" ON "llm_config" ("user_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_config_userId_active_idx" ON "llm_config" ("user_id","is_active") WHERE "is_active" = true;--> statement-breakpoint
ALTER TABLE "llm_config" ADD CONSTRAINT "llm_config_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;