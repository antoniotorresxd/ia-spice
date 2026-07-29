import { describe, expect, test } from "bun:test";

import app from "@/app";
import env from "@/lib/env";

describe("rutas de administración de LLM", () => {
  test("GET /api/llm/connections sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/connections");
    expect(res.status).toBe(401);
  });

  test("POST /api/llm/connections sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x", provider: "anthropic", apiKey: "k" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/llm/connections/:id/test sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/connections/some-id/test", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("GET /api/llm/assignments sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/assignments");
    expect(res.status).toBe(401);
  });

  test("PUT /api/llm/assignments/:agentId sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/assignments/orchestrator", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: null, model: "" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("endpoint interno para agents", () => {
  const internalUrl = "/api/internal/llm/agent/orchestrator?userId=user-1";

  test("401 sin token", async () => {
    const res = await app.request(internalUrl);
    expect(res.status).toBe(401);
  });

  test("401 con token incorrecto", async () => {
    const res = await app.request(internalUrl, {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("400 sin el query param userId", async () => {
    const res = await app.request("/api/internal/llm/agent/orchestrator", {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect(res.status).toBe(400);
  });

  test("400 con un agentId desconocido", async () => {
    const res = await app.request("/api/internal/llm/agent/inexistente?userId=user-1", {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect(res.status).toBe(400);
  });

  const runDb = process.env.RUN_DB_TESTS === "1";
  test.skipIf(!runDb)("200 o 404 con token válido (forma del contrato)", async () => {
    const userId = process.env.TEST_USER_ID ?? "test-user-00000000";
    const res = await app.request(`/api/internal/llm/agent/orchestrator?userId=${userId}`, {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["api_key", "base_url", "model", "provider"]);
    }
  });
});
