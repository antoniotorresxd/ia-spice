import { Scalar } from "@scalar/hono-api-reference";

import type { AppOpenAPI } from "./types";

export default function configureOpenAPI(app: AppOpenAPI) {
  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "IA Spice API",
    },
  });

  app.get(
    "/reference",
    Scalar({
      sources: [
        { url: "/doc", title: "IA Spice API" },
        { url: "/api/auth/open-api/generate-schema", title: "Auth API" },
      ],
      theme: "kepler",
      layout: "classic",
    }),
  );
}
