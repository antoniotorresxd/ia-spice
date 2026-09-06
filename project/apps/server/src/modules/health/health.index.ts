import { createRouter } from "@/lib/create-app";

export const healthRouter = createRouter()
  .get("/api/health", (c) => c.json({ status: "ok" }));
