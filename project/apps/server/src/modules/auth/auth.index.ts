import { createRouter } from "@/lib/create-app";

import { auth } from "./auth.services";

export const authRouter = createRouter().on(
  ["POST", "GET"],
  "/api/auth/*",
  (c) => auth.handler(c.req.raw),
);
