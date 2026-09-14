import { describe, expect, test } from "bun:test";

import app from "@/app";
import env from "@/lib/env";

describe("rutas públicas de catálogo de circuitos", () => {
  test("GET /api/circuits retorna lista de circuitos", async () => {
    const res = await app.request("/api/circuits");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ id: string; name: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(6);
    expect(data.some((c) => c.id === "rc_lowpass_passive")).toBe(true);
    expect(data.some((c) => c.id === "bjt_voltage_divider")).toBe(true);
  });

  test("GET /api/circuits?category=filtros filtra por categoría", async () => {
    const res = await app.request("/api/circuits?category=filtros");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ id: string; category: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.every((c) => c.category === "filtros")).toBe(true);
  });

  test("GET /api/circuits/:id retorna ficha completa", async () => {
    const res = await app.request("/api/circuits/bjt_voltage_divider");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; designEquations: string; spiceTemplate: string };
    expect(data.id).toBe("bjt_voltage_divider");
    expect(data.designEquations).toBeDefined();
    expect(data.spiceTemplate).toContain("NPN_MODEL");
  });

  test("GET /api/circuits/inexistente -> 404", async () => {
    const res = await app.request("/api/circuits/non_existent_circuit_id");
    expect(res.status).toBe(404);
  });
});

describe("rutas internas de circuitos para agents", () => {
  test("GET /api/internal/circuits sin token -> 401", async () => {
    const res = await app.request("/api/internal/circuits");
    expect(res.status).toBe(401);
  });

  test("GET /api/internal/circuits con token inválido -> 401", async () => {
    const res = await app.request("/api/internal/circuits", {
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/internal/circuits con AGENTS_SERVICE_TOKEN válido -> 200", async () => {
    const res = await app.request("/api/internal/circuits", {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ id: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(6);
  });

  test("GET /api/internal/circuits/:id con AGENTS_SERVICE_TOKEN válido -> 200", async () => {
    const res = await app.request("/api/internal/circuits/opamp_highpass_active", {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; spiceTemplate: string };
    expect(data.id).toBe("opamp_highpass_active");
    expect(data.spiceTemplate).toContain("opamp");
  });
});
