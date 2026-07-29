import { describe, expect, test } from "bun:test";

import {
  createConnectionSchema,
  toPublicConnection,
  updateAssignmentSchema,
  updateConnectionSchema,
} from "./llm.schemas";

describe("createConnectionSchema", () => {
  test("acepta un provider normal con apiKey", () => {
    const result = createConnectionSchema.safeParse({
      label: "OpenAI",
      provider: "openai",
      apiKey: "sk-test-1234",
    });
    expect(result.success).toBe(true);
  });

  test("rechaza un provider normal sin apiKey", () => {
    const result = createConnectionSchema.safeParse({
      label: "OpenAI",
      provider: "openai",
    });
    expect(result.success).toBe(false);
  });

  test("acepta openai_compatible sin apiKey si trae baseUrl", () => {
    const result = createConnectionSchema.safeParse({
      label: "Ollama",
      provider: "openai_compatible",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(result.success).toBe(true);
  });

  test("rechaza openai_compatible sin baseUrl", () => {
    const result = createConnectionSchema.safeParse({
      label: "Ollama",
      provider: "openai_compatible",
    });
    expect(result.success).toBe(false);
  });

  test("ya no acepta el campo model, que ahora vive en la asignación", () => {
    const result = createConnectionSchema.safeParse({
      label: "OpenAI",
      provider: "openai",
      apiKey: "sk-test-1234",
      model: "gpt-5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("model" in result.data).toBe(false);
    }
  });
});

describe("updateConnectionSchema", () => {
  test("permite baseUrl nulo para limpiarlo", () => {
    const result = updateConnectionSchema.safeParse({ baseUrl: null });
    expect(result.success).toBe(true);
  });

  test("rechaza una apiKey vacía", () => {
    const result = updateConnectionSchema.safeParse({ apiKey: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateAssignmentSchema", () => {
  test("acepta connectionId nulo para desasignar", () => {
    const result = updateAssignmentSchema.safeParse({ connectionId: null, model: "" });
    expect(result.success).toBe(true);
  });

  test("acepta una asignación completa", () => {
    const result = updateAssignmentSchema.safeParse({
      connectionId: "conn-1",
      model: "gpt-5",
    });
    expect(result.success).toBe(true);
  });

  test("rechaza si falta model", () => {
    const result = updateAssignmentSchema.safeParse({ connectionId: "conn-1" });
    expect(result.success).toBe(false);
  });
});

describe("toPublicConnection", () => {
  const row = {
    id: "conn-1",
    userId: "user-1",
    label: "OpenAI",
    provider: "openai" as const,
    apiKeyEncrypted: "cifrado:abc",
    keyHint: "1234",
    baseUrl: null,
    lastTestedAt: new Date("2026-07-29T10:00:00.000Z"),
    lastTestStatus: "ok" as const,
    createdAt: new Date("2026-07-29T09:00:00.000Z"),
    updatedAt: new Date("2026-07-29T09:00:00.000Z"),
  };

  test("nunca expone la key, ni cifrada", () => {
    const publicView = toPublicConnection(row);
    expect(JSON.stringify(publicView)).not.toContain("cifrado:abc");
    expect("apiKeyEncrypted" in publicView).toBe(false);
    expect("userId" in publicView).toBe(false);
  });

  test("expone el estado de prueba y la pista de la key", () => {
    const publicView = toPublicConnection(row);
    expect(publicView.hasKey).toBe(true);
    expect(publicView.keyHint).toBe("1234");
    expect(publicView.lastTestStatus).toBe("ok");
  });
});
