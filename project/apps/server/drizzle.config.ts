import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/**/*.model.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATA_BASE_URL!,
  },
  strict: true,
  verbose: true,
});
