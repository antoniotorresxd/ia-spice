import { createMiddleware } from "hono/factory";

import { auth } from "@/modules/auth/auth.services";

import type { AppBindings } from "@/lib/types";

export const sessionMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!result) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  c.set("user", result.user);
  c.set("session", result.session);
  return next();
});

export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});
