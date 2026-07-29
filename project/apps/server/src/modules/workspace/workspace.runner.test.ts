import { describe, expect, test } from "bun:test";

import {
  type AgentsRunResult,
  mapVerdictToStatus,
  toArtifactDrafts,
  toAssistantMessage,
} from "./workspace.runner";

const accepted: AgentsRunResult = {
  verdict: { status: "accepted", reason: "all blocks within tolerance", best_iteration: 0 },
  normalized_spec: { blocks: [] },
  netlists: { "block-1": { path: "/tmp/circuit.cir", text: "* divisor\nR1 in out 1k\n" } },
  sim_results: { "block-1": { metrics: { v_out: 5.01 }, sim_error: null } },
  component_values: { "block-1": { r1: 1000, r2: 714 } },
  history: [],
  iteration: 0,
};

describe("mapVerdictToStatus", () => {
  test("accepted -> completed con el motivo del veredicto", () => {
    expect(mapVerdictToStatus(accepted.verdict)).toEqual({
      status: "completed",
      summary: "all blocks within tolerance",
    });
  });

  test("rejected -> failed: no obtuviste un circuito", () => {
    expect(
      mapVerdictToStatus({
        status: "rejected",
        reason: "goals not met after 5 iterations",
        best_iteration: 2,
      }),
    ).toEqual({ status: "failed", summary: "goals not met after 5 iterations" });
  });

  test("un rechazo por LLM sin configurar dice dónde configurarlo", () => {
    const result = mapVerdictToStatus({
      status: "rejected",
      reason: "llm_settings_unavailable: no assignment for orchestrator",
      best_iteration: null,
    });
    expect(result.status).toBe("failed");
    expect(result.summary).toContain("Configuración");
    expect(result.summary).not.toContain("llm_settings_unavailable");
  });

  test("sin veredicto -> failed, no se asume éxito", () => {
    expect(mapVerdictToStatus(null)).toEqual({
      status: "failed",
      summary: "La corrida terminó sin veredicto.",
    });
  });
});

describe("toArtifactDrafts", () => {
  test("un artefacto por netlist, con el texto y el nombre del bloque", () => {
    expect(toArtifactDrafts(accepted)).toEqual([
      {
        blockId: "block-1",
        name: "block-1.cir",
        language: "spice",
        content: "* divisor\nR1 in out 1k\n",
        status: "complete",
      },
    ]);
  });

  test("un bloque con error de simulación queda parcial", () => {
    const drafts = toArtifactDrafts({
      ...accepted,
      sim_results: { "block-1": { metrics: null, sim_error: "ngspice exited 1" } },
    });
    expect(drafts[0]!.status).toBe("partial");
  });

  test("sin netlists devuelve una lista vacía, no revienta", () => {
    expect(toArtifactDrafts({ ...accepted, netlists: {} })).toEqual([]);
  });
});

describe("toAssistantMessage", () => {
  test("incluye el resumen, las métricas medidas y las iteraciones", () => {
    const content = toAssistantMessage(accepted);
    expect(content).toContain("all blocks within tolerance");
    expect(content).toContain("block-1.v_out = 5.01");
    expect(content).toContain("Iteraciones: 1");
  });

  test("un bloque con error de simulación reporta el error en lugar de la métrica", () => {
    const content = toAssistantMessage({
      ...accepted,
      sim_results: { "block-1": { metrics: null, sim_error: "ngspice exited 1" } },
    });
    expect(content).toContain("block-1: ngspice exited 1");
  });
});
