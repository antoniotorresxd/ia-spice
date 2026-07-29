import { describe, expect, test } from "bun:test";

import { buildProbeRequest, probeConnection } from "./llm.providers";

describe("buildProbeRequest", () => {
  test("OpenAI usa el header Authorization", () => {
    const req = buildProbeRequest({ provider: "openai", apiKey: "sk-1", baseUrl: null });
    expect(req?.url).toBe("https://api.openai.com/v1/models");
    expect(req?.headers.Authorization).toBe("Bearer sk-1");
  });

  test("Anthropic usa x-api-key y exige la versión", () => {
    const req = buildProbeRequest({ provider: "anthropic", apiKey: "sk-2", baseUrl: null });
    expect(req?.url).toBe("https://api.anthropic.com/v1/models");
    expect(req?.headers["x-api-key"]).toBe("sk-2");
    expect(req?.headers["anthropic-version"]).toBe("2023-06-01");
  });

  test("Google manda la key en el query string", () => {
    const req = buildProbeRequest({ provider: "google", apiKey: "sk-3", baseUrl: null });
    expect(req?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?key=sk-3",
    );
  });

  test("openai_compatible cuelga /models del baseUrl sin duplicar la diagonal", () => {
    const req = buildProbeRequest({
      provider: "openai_compatible",
      apiKey: null,
      baseUrl: "http://localhost:11434/v1/",
    });
    expect(req?.url).toBe("http://localhost:11434/v1/models");
  });

  test("devuelve null si falta la credencial que el provider exige", () => {
    expect(buildProbeRequest({ provider: "openai", apiKey: null, baseUrl: null })).toBeNull();
    expect(
      buildProbeRequest({ provider: "openai_compatible", apiKey: null, baseUrl: null }),
    ).toBeNull();
  });
});

describe("probeConnection", () => {
  test("200 del proveedor -> ok", async () => {
    const fakeFetch = async () => new Response("{}", { status: 200 });
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-1", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: true });
  });

  test("401 del proveedor -> falla mencionando la credencial", async () => {
    const fakeFetch = async () => new Response("no", { status: 401 });
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-mala", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("credencial");
  });

  test("otro status -> falla reportando el código", async () => {
    const fakeFetch = async () => new Response("boom", { status: 503 });
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-1", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("503");
  });

  test("error de red -> falla sin lanzar excepción", async () => {
    const fakeFetch = async () => {
      throw new TypeError("fetch failed");
    };
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-1", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("alcanzar");
  });

  test("credencial faltante -> falla sin hacer ninguna petición", async () => {
    let llamadas = 0;
    const fakeFetch = async () => {
      llamadas += 1;
      return new Response("{}", { status: 200 });
    };
    const result = await probeConnection(
      { provider: "openai", apiKey: null, baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(llamadas).toBe(0);
  });
});
