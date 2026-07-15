CREATE TABLE "llm_config" (
	"id" text PRIMARY KEY,
	"label" text NOT NULL UNIQUE,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"api_key_encrypted" text,
	"key_hint" text,
	"base_url" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "llm_config_single_active_idx" ON "llm_config" ("is_active") WHERE "is_active" = true;