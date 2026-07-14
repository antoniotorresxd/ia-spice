import app from "@/app";
export type { AppType } from "@/app";
import env from "@/lib/env";

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`Server running at http://localhost:${server.port}`);

