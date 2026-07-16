import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/session";

import { auth } from "./auth.services";

export const authRouter = createRouter()
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .get("/api/auth/me", requireAuth, (c) => {
    const user = c.get("user")!;
    return c.json({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
    });
  });
