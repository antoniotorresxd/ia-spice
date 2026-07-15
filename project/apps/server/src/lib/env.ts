import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3001),
  DATA_BASE_URL: z.string().min(1),
  DATA_BASE_URL_POOL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  APP_URL: z.string().default("http://localhost:5173"),
  LLM_SECRETS_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 bytes hex (64 hex chars)"),
  AGENTS_SERVICE_TOKEN: z.string().min(16),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
});

export type Env = z.infer<typeof EnvSchema>;

const { data: env, error } = EnvSchema.safeParse(process.env);

if (error) {
  console.error("Invalid environment variables:");
  console.error(z.treeifyError(error));
  process.exit(1);
}

export default env!;
