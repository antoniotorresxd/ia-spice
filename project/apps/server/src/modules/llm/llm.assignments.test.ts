import { describe, expect, test } from "bun:test";

import { fillAssignmentGaps } from "./llm.services";

describe("fillAssignmentGaps", () => {
  test("devuelve los cuatro agentes aunque no haya ninguna fila", () => {
    const result = fillAssignmentGaps([]);
    expect(result.map((r) => r.agentId)).toEqual([
      "orchestrator",
      "calculation",
      "writer",
      "curator",
    ]);
    expect(result.every((r) => r.connectionId === null && r.model === "")).toBe(true);
  });

  test("conserva las filas existentes y rellena el resto", () => {
    const result = fillAssignmentGaps([
      { agentId: "orchestrator", connectionId: "conn-1", model: "gpt-5" },
    ]);
    expect(result).toHaveLength(4);
    expect(result.find((r) => r.agentId === "orchestrator")).toEqual({
      agentId: "orchestrator",
      connectionId: "conn-1",
      model: "gpt-5",
    });
    expect(result.find((r) => r.agentId === "curator")).toEqual({
      agentId: "curator",
      connectionId: null,
      model: "",
    });
  });

  test("el orden es siempre el de AGENT_IDS, no el de las filas", () => {
    const result = fillAssignmentGaps([
      { agentId: "curator", connectionId: "conn-2", model: "haiku" },
      { agentId: "orchestrator", connectionId: "conn-1", model: "gpt-5" },
    ]);
    expect(result.map((r) => r.agentId)).toEqual([
      "orchestrator",
      "calculation",
      "writer",
      "curator",
    ]);
  });
});
