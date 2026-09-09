ALTER TABLE "artifact" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "components" jsonb;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "measurement_explanation" text;