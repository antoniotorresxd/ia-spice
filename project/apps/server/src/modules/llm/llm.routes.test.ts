import { describe, expect, test } from "bun:test";

import app from "@/app";
import env from "@/lib/env";

describe("llm admin routes", () => {
  test("GET /api/llm without session -> 401", async () => {
    const res = await app.request("/api/llm");
    expect(res.status).toBe(401);
  });

  test("POST /api/llm without session -> 401", async () => {
    const res = await app.request("/api/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x", provider: "anthropic", model: "m", apiKey: "k" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/llm/:id/activate without session -> 401", async () => {
    const res = await app.request("/api/llm/some-id/activate", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("internal llm endpoint", () => {
  test("401 without token", async () => {
    const res = await app.request("/api/internal/llm/active");
    expect(res.status).toBe(401);
  });

  test("401 with wrong token", async () => {
    const res = await app.request("/api/internal/llm/active", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  // Integración con BD: 404 sin activa / 200 con la shape del contrato.
  // Gateado igual que los tests de servicios.
  const runDb = process.env.RUN_DB_TESTS === "1";
  test.skipIf(!runDb)("200 or 404 with valid token (contract shape)", async () => {
    const res = await app.request("/api/internal/llm/active", {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["api_key", "base_url", "model", "provider"]);
    }
  });
});
