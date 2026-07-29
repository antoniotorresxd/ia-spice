import { describe, expect, test } from "bun:test";

import app from "@/app";

// Sin sesión toda ruta del workspace debe cerrarse. El comportamiento con
// sesión se cubre en workspace.services.test.ts, que sí toca la base.
describe("rutas del workspace sin sesión", () => {
  test("GET /api/workspace/snapshot -> 401", async () => {
    expect((await app.request("/api/workspace/snapshot")).status).toBe(401);
  });

  test("GET /api/workspace/projects/:id -> 401", async () => {
    expect((await app.request("/api/workspace/projects/p-1")).status).toBe(401);
  });

  test("POST /api/workspace/projects -> 401", async () => {
    const res = await app.request("/api/workspace/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Filtros" }),
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/workspace/conversations/:id -> 401", async () => {
    expect((await app.request("/api/workspace/conversations/c-1")).status).toBe(401);
  });

  test("POST /api/workspace/conversations -> 401", async () => {
    const res = await app.request("/api/workspace/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "un divisor" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/workspace/conversations/:id/messages -> 401", async () => {
    const res = await app.request("/api/workspace/conversations/c-1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "ahora a 3.3V" }),
    });
    expect(res.status).toBe(401);
  });

  test("PATCH /api/workspace/conversations/:id/project -> 401", async () => {
    const res = await app.request("/api/workspace/conversations/c-1/project", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: null }),
    });
    expect(res.status).toBe(401);
  });
});
