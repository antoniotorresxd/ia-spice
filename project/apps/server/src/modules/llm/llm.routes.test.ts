import { describe, expect, test } from "bun:test";

import app from "@/app";

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
