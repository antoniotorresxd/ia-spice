CREATE TABLE "circuit_knowledge" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"topology_summary" text NOT NULL,
	"parameters_schema" jsonb NOT NULL,
	"operating_constraints" text NOT NULL,
	"design_equations" text NOT NULL,
	"spice_template" text NOT NULL,
	"numerical_example" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
