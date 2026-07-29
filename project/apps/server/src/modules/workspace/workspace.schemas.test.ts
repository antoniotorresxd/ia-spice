import { describe, expect, test } from "bun:test";

import {
  createProjectSchema,
  derivePreview,
  deriveTitle,
  moveConversationSchema,
  submitTextSchema,
  truncate,
} from "./workspace.schemas";

describe("truncate", () => {
  test("deja el texto corto intacto", () => {
    expect(truncate("un divisor de 12V a 5V", 80)).toBe("un divisor de 12V a 5V");
  });

  test("colapsa saltos de línea y espacios repetidos", () => {
    expect(truncate("un divisor\n\n  de 12V", 80)).toBe("un divisor de 12V");
  });

  test("recorta y añade elipsis sin pasarse del máximo", () => {
    const result = truncate("abcdefghij", 5);
    expect(result).toBe("abcd…");
    expect(result.length).toBe(5);
  });
});

describe("deriveTitle y derivePreview", () => {
  test("el título usa el máximo de título", () => {
    expect(deriveTitle("x".repeat(200)).length).toBe(80);
  });

  test("el preview usa el máximo de preview", () => {
    expect(derivePreview("x".repeat(200)).length).toBe(120);
  });
});

describe("createProjectSchema", () => {
  test("la descripción por defecto es cadena vacía", () => {
    const parsed = createProjectSchema.parse({ name: "Filtros" });
    expect(parsed).toEqual({ name: "Filtros", description: "" });
  });

  test("rechaza el nombre vacío", () => {
    expect(createProjectSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("submitTextSchema", () => {
  test("rechaza texto vacío o solo espacios", () => {
    expect(submitTextSchema.safeParse({ text: "" }).success).toBe(false);
    expect(submitTextSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  test("acepta y recorta los extremos", () => {
    expect(submitTextSchema.parse({ text: "  un divisor  " })).toEqual({
      text: "un divisor",
    });
  });
});

describe("moveConversationSchema", () => {
  test("projectId nulo es válido: saca la conversación de su proyecto", () => {
    expect(moveConversationSchema.parse({ projectId: null })).toEqual({ projectId: null });
  });

  test("rechaza projectId como cadena vacía", () => {
    expect(moveConversationSchema.safeParse({ projectId: "" }).success).toBe(false);
  });
});
