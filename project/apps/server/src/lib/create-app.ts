import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";

import { requestLogger } from "@/middleware/request-logger";
import { sessionMiddleware } from "@/middleware/session";

import env from "./env";

import type { AppBindings } from "./types";

export function createRouter() {
  return new OpenAPIHono<AppBindings>({ strict: false });
}

export default function createApp() {
  const app = createRouter();

  app.use(requestLogger);
  app.use(
    "*",
    cors({
      origin: env.CORS_ALLOWED_ORIGINS,
      credentials: true,
    }),
  );
  app.use(sessionMiddleware);

  app.notFound((c) => c.json({ error: "Not Found" }, 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
