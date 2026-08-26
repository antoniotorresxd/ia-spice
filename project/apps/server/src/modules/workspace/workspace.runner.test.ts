import { describe, expect, test } from "bun:test";

import {
  type AgentsRunResult,
  mapVerdictToStatus,
  startRun,
  toArtifactDrafts,
  toAssistantMessage,
  type RunSink,
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

function recordingSink() {
  const results: AgentsRunResult[] = [];
  const failures: string[] = [];
  const sink: RunSink = {
    async onResult(result) {
      results.push(result);
    },
    async onFailure(summary) {
      failures.push(summary);
    },
  };
  return { sink, results, failures };
}

describe("startRun", () => {
  test("manda user_id y request_text al endpoint de agents con el bearer", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(accepted), { status: 200 });
    };
    const { sink, results } = recordingSink();

    await startRun(
      { userId: "user-1", requestText: "un divisor de 12V a 5V", executionId: "exec-1" },
      sink,
      fakeFetch as unknown as typeof fetch,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toEndWith("/runs");
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toStartWith("Bearer ");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      user_id: "user-1",
      request_text: "un divisor de 12V a 5V",
      execution_id: "exec-1",
    });
    expect(results).toEqual([accepted]);
  });

  test("una respuesta no-2xx falla sin filtrar el cuerpo del error", async () => {
    const fakeFetch = async () => new Response("stack trace interno", { status: 500 });
    const { sink, results, failures } = recordingSink();

    await startRun({ userId: "user-1", requestText: "x", executionId: "exec-1" }, sink, fakeFetch as unknown as typeof fetch);

    expect(results).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBe("No pudimos ejecutar el diseño. Inténtalo de nuevo.");
  });

  test("agents inalcanzable falla sin propagar la excepción", async () => {
    const fakeFetch = async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:8000");
    };
    const { sink, failures } = recordingSink();

    await startRun({ userId: "user-1", requestText: "x", executionId: "exec-1" }, sink, fakeFetch as unknown as typeof fetch);

    expect(failures[0]).toBe("No pudimos ejecutar el diseño. Inténtalo de nuevo.");
  });

  test("un cuerpo que no es JSON también falla con el mensaje neutro", async () => {
    const fakeFetch = async () => new Response("<html>502</html>", { status: 200 });
    const { sink, failures } = recordingSink();

    await startRun({ userId: "user-1", requestText: "x", executionId: "exec-1" }, sink, fakeFetch as unknown as typeof fetch);

    expect(failures[0]).toBe("No pudimos ejecutar el diseño. Inténtalo de nuevo.");
  });
});
