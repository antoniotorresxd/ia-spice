import { describe, expect, test } from "bun:test";

import {
  createLlmConfigSchema,
  toPublicLlmConfig,
  updateLlmConfigSchema,
} from "./llm.schemas";

describe("createLlmConfigSchema", () => {
  test("accepts anthropic with apiKey", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Claude prod",
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-ant-xxx",
    });
    expect(result.success).toBe(true);
  });

  test("rejects anthropic without apiKey", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Claude prod",
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
    expect(result.success).toBe(false);
  });

  test("accepts openai_compatible with baseUrl and no apiKey", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Ollama local",
      provider: "openai_compatible",
      model: "llama3.1:8b",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(result.success).toBe(true);
  });

  test("rejects openai_compatible without baseUrl", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Ollama local",
      provider: "openai_compatible",
      model: "llama3.1:8b",
    });
    expect(result.success).toBe(false);
  });

  test("rejects unknown provider", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "x",
      provider: "nope",
      model: "y",
      apiKey: "z",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateLlmConfigSchema", () => {
  test("all fields optional", () => {
    expect(updateLlmConfigSchema.safeParse({}).success).toBe(true);
    expect(updateLlmConfigSchema.safeParse({ model: "gpt-4o" }).success).toBe(true);
  });
});

describe("toPublicLlmConfig", () => {
  const row = {
    id: "abc",
    userId: "user-test-001",
    label: "Claude prod",
    provider: "anthropic" as const,
    model: "claude-sonnet-5",
    apiKeyEncrypted: "iv:ct:tag",
    keyHint: "x123",
    baseUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  test("never exposes the encrypted key", () => {
    const pub = toPublicLlmConfig(row);
    expect(JSON.stringify(pub)).not.toContain("iv:ct:tag");
    expect((pub as Record<string, unknown>).apiKeyEncrypted).toBeUndefined();
  });

  test("exposes hasKey and keyHint instead", () => {
    const pub = toPublicLlmConfig(row);
    expect(pub.hasKey).toBe(true);
    expect(pub.keyHint).toBe("x123");
    expect(toPublicLlmConfig({ ...row, apiKeyEncrypted: null, keyHint: null }).hasKey).toBe(false);
  });
});
