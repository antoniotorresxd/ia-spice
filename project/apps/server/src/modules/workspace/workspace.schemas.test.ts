import { describe, expect, test } from "bun:test";

import {
  createProjectSchema,
  derivePreview,
  deriveTitle,
  moveConversationSchema,
  submitTextSchema,
  toConversationDetail,
  toConversationSummary,
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

const conversationRow = {
  id: "conv-1",
  userId: "user-1",
  projectId: null,
  title: "un divisor de 12V a 5V",
  createdAt: new Date("2026-07-29T12:00:00Z"),
  updatedAt: new Date("2026-07-29T12:00:05Z"),
};

const messageRows = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user" as const,
    content: "un divisor de 12V a 5V",
    createdAt: new Date("2026-07-29T12:00:00Z"),
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant" as const,
    content: "all blocks within tolerance",
    createdAt: new Date("2026-07-29T12:00:05Z"),
  },
];

const executionRow = {
  id: "exec-1",
  conversationId: "conv-1",
  status: "completed" as const,
  summary: "all blocks within tolerance",
  requestText: "un divisor de 12V a 5V",
  verdict: null,
  normalizedSpec: null,
  history: null,
  startedAt: new Date("2026-07-29T12:00:00Z"),
  finishedAt: new Date("2026-07-29T12:00:05Z"),
};

const artifactRow = {
  id: "art-1",
  conversationId: "conv-1",
  blockId: "block-1",
  name: "block-1.cir",
  language: "spice",
  content: "* divisor\nR1 in out 1k\n",
  status: "complete" as const,
  createdAt: new Date("2026-07-29T12:00:05Z"),
};

describe("toConversationSummary", () => {
  test("el preview es el último mensaje y el estado el de la ejecución", () => {
    expect(toConversationSummary(conversationRow, messageRows[1], executionRow)).toEqual({
      id: "conv-1",
      projectId: null,
      title: "un divisor de 12V a 5V",
      preview: "all blocks within tolerance",
      updatedAt: "2026-07-29T12:00:05.000Z",
      executionStatus: "completed",
    });
  });

  test("sin mensajes el preview queda vacío, no undefined", () => {
    expect(toConversationSummary(conversationRow, undefined, executionRow).preview).toBe("");
  });

  test("sin ejecución se reporta failed: la creación quedó a medias", () => {
    expect(toConversationSummary(conversationRow, messageRows[1], undefined).executionStatus).toBe(
      "failed",
    );
  });
});

describe("toConversationDetail", () => {
  test("arma mensajes, archivos y ejecución con fechas serializadas", () => {
    const detail = toConversationDetail(conversationRow, messageRows, [artifactRow], executionRow);
    expect(detail.messages).toEqual([
      { id: "msg-1", role: "user", content: "un divisor de 12V a 5V", createdAt: "2026-07-29T12:00:00.000Z" },
      { id: "msg-2", role: "assistant", content: "all blocks within tolerance", createdAt: "2026-07-29T12:00:05.000Z" },
    ]);
    expect(detail.files).toEqual([
      {
        id: "art-1",
        name: "block-1.cir",
        language: "spice",
        content: "* divisor\nR1 in out 1k\n",
        status: "complete",
      },
    ]);
    expect(detail.execution).toEqual({
      id: "exec-1",
      status: "completed",
      summary: "all blocks within tolerance",
    });
  });

  test("sin ejecución sintetiza una fallida en lugar de romperse", () => {
    const detail = toConversationDetail(conversationRow, messageRows, [], undefined);
    expect(detail.execution.status).toBe("failed");
    expect(detail.execution.summary).toBe("La ejecución no se pudo registrar.");
    expect(detail.executionStatus).toBe("failed");
  });
});
