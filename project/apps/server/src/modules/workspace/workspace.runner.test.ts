import { describe, expect, test } from "bun:test";

import {
  type AgentsRunResult,
  mapVerdictToStatus,
  resolveRunOutcome,
  startRun,
  toArtifactDrafts,
  toAssistantMessage,
  type RunSink,
} from "./workspace.runner";

const accepted: AgentsRunResult = {
  outcome: null,
  verdict: { status: "accepted", reason: "all blocks within tolerance", best_iteration: 0 },
  normalized_spec: { blocks: [] },
  netlists: { "block-1": { path: "/tmp/circuit.cir", text: "* divisor\nR1 in out 1k\n" } },
  sim_results: { "block-1": { metrics: { v_out: 5.01 }, sim_error: null } },
  component_values: { "block-1": { r1: 1000, r2: 714 } },
  documentation: null,
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
        summary: null,
        tags: null,
        components: null,
        measurementExplanation: null,
        bom: null,
      },
    ]);
  });

  test("la lista de materiales de cada bloque viaja en su artefacto", () => {
    const bom = [
      { nombre: "R2", tipo: "resistencia", cantidad: 1, unidad: "ohm", serie: "E24", ideal: 7142.86, valor: 7142.86, realizacion: "paralelo" as const, partes: [7500, 150000], error_pct: 0 },
      { nombre: "Q1", tipo: "transistor", cantidad: 1, pieza: "2N3904", referencias: ["Q1"], nota: "BJT NPN", modelo_real: true },
    ];
    const drafts = toArtifactDrafts({ ...accepted, bom: { "block-1": bom } });
    expect(drafts[0].bom).toEqual(bom);
  });

  test("mergea la documentación por bloque sin cambiar el estado de simulación", () => {
    const drafts = toArtifactDrafts({
      ...accepted,
      documentation: {
        "block-1": {
          summary: "Divide el voltaje de entrada.",
          tags: ["divisor", "resistivo"],
          components: { R1: "Resistencia de entrada." },
          measurement_explanation: "Mide el voltaje de salida.",
        },
      },
      sim_results: { "block-1": { metrics: null, sim_error: "ngspice exited 1" } },
    });
    expect(drafts[0]).toMatchObject({
      summary: "Divide el voltaje de entrada.",
      tags: ["divisor", "resistivo"],
      components: { R1: "Resistencia de entrada." },
      measurementExplanation: "Mide el voltaje de salida.",
      status: "partial",
    });
  });

  for (const [label, documentation] of [
    ["entrada nula", { "block-1": null }],
    ["bloque ausente", {}],
    ["documentación nula", null],
  ] as const) {
    test(`${label}: todos los campos de documentación quedan null`, () => {
      const drafts = toArtifactDrafts({
        ...accepted,
        netlists: {
          ...accepted.netlists,
          "block-2": { path: "/tmp/other.cir", text: "* otro bloque" },
        },
        documentation,
      });
      expect(drafts).toHaveLength(2);
      for (const draft of drafts) {
        expect(draft).toMatchObject({
          summary: null,
          tags: null,
          components: null,
          measurementExplanation: null,
        });
      }
    });
  }

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

describe("resolveRunOutcome", () => {
  test("outcome chat -> completed con la respuesta, sin tocar artefactos ni el spec", () => {
    const result = resolveRunOutcome({
      ...accepted,
      outcome: { mode: "chat", reply: "¡Hola! ¿Qué circuito querés diseñar?" },
    });

    expect(result).toEqual({
      status: "completed",
      summary: "¡Hola! ¿Qué circuito querés diseñar?",
      assistantMessage: "¡Hola! ¿Qué circuito querés diseñar?",
      normalizedSpec: null,
      artifacts: null,
      mode: "chat",
    });
  });

  test("outcome chat conserva el spec parcial anterior", () => {
    const previousNormalizedSpec = { type: "voltage_divider" };
    const result: AgentsRunResult = {
      ...accepted,
      outcome: { mode: "chat", reply: "¡Hola!" },
      normalized_spec: null,
    };

    expect(resolveRunOutcome(result, previousNormalizedSpec).normalizedSpec).toBe(previousNormalizedSpec);
    expect(resolveRunOutcome(result).normalizedSpec).toBeNull();
    expect(resolveRunOutcome(result, null).normalizedSpec).toBeNull();
  });

  test("outcome clarify -> completed con la pregunta y el spec parcial reinyectable", () => {
    const result = resolveRunOutcome({
      ...accepted,
      outcome: {
        mode: "clarify",
        question: "¿Qué voltaje de entrada y de salida necesitás?",
        partial_spec: { type: "voltage_divider" },
      },
    });

    expect(result).toEqual({
      status: "completed",
      summary: "¿Qué voltaje de entrada y de salida necesitás?",
      assistantMessage: "¿Qué voltaje de entrada y de salida necesitás?",
      normalizedSpec: { type: "voltage_divider" },
      artifacts: null,
      mode: "clarify",
    });
  });

  test("sin outcome (o outcome design) usa el camino de veredicto existente, artefactos incluidos", () => {
    const result = resolveRunOutcome({ ...accepted, outcome: null });

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("all blocks within tolerance");
    expect(result.normalizedSpec).toEqual(accepted.normalized_spec);
    expect(result.mode).toBe("design");
    expect(result.artifacts).toEqual(toArtifactDrafts(accepted));
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

  test("procesa eventos SSE llamando onStageUpdate y luego onResult", async () => {
    const sseBody = [
      'event: stage\ndata: {"id":"stage-interpretation","kind":"interpretation","label":"Interpretación","actor":"Orquestador","status":"active","durationMs":null,"summary":"Interpretando...","metrics":[]}\n\n',
      'event: stage\ndata: {"id":"stage-interpretation","kind":"interpretation","label":"Interpretación","actor":"Orquestador","status":"completed","durationMs":500,"summary":"Listo","metrics":[]}\n\n',
      `event: done\ndata: ${JSON.stringify(accepted)}\n\n`,
    ].join("");

    const fakeFetch = async () =>
      new Response(sseBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });

    const stages: any[] = [];
    const results: any[] = [];
    const failures: string[] = [];

    const sink = {
      onStageUpdate: (stage: any) => {
        stages.push(stage);
      },
      onResult: async (res: any) => {
        results.push(res);
      },
      onFailure: async (fail: string) => {
        failures.push(fail);
      },
    };

    await startRun(
      { userId: "user-1", requestText: "un divisor", executionId: "exec-1" },
      sink,
      fakeFetch as unknown as typeof fetch,
    );

    expect(failures).toEqual([]);
    expect(stages).toHaveLength(2);
    expect(stages[0].kind).toBe("interpretation");
    expect(stages[0].status).toBe("active");
    expect(stages[1].status).toBe("completed");
    expect(results).toEqual([accepted]);
  });
});


describe("resolveRunOutcome en modo análisis", () => {
  const analysis: AgentsRunResult = {
    ...accepted,
    verdict: null,
    outcome: {
      mode: "analysis",
      informe: "ANÁLISIS DE LA RED — régimen DC\n...",
      error: null,
      resultados: { validacion: { coincide: true, error: null } },
    },
    netlists: { analisis: { path: "/tmp/analisis.cir", text: "* Analisis de red\nR1 a 0 1k\n" } },
    sim_results: {},
  };

  test("el informe es el mensaje y el netlist verificado queda como artefacto", () => {
    const outcome = resolveRunOutcome(analysis, { previo: true });

    expect(outcome.mode).toBe("analysis");
    expect(outcome.status).toBe("completed");
    expect(outcome.assistantMessage).toBe("ANÁLISIS DE LA RED — régimen DC\n...");
    expect(outcome.summary).toContain("ngspice confirma");
    expect(outcome.artifacts?.map((a) => a.name)).toEqual(["analisis.cir"]);
    // un análisis no redefine el diseño vigente de la conversación
    expect(outcome.normalizedSpec).toEqual({ previo: true });
  });

  test("si ngspice no coincide se completa pero lo dice", () => {
    const outcome = resolveRunOutcome({
      ...analysis,
      outcome: { mode: "analysis", informe: "x", error: null, resultados: { validacion: { coincide: false } } },
    });
    expect(outcome.status).toBe("completed");
    expect(outcome.summary).toContain("no confirmó");
  });

  test("una red ilegible es un análisis fallido", () => {
    const outcome = resolveRunOutcome({
      ...analysis,
      netlists: {},
      outcome: { mode: "analysis", informe: "No se pudo leer la red: Q1", error: "Q1: solo se analizan redes de R, L, C", resultados: {} },
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toContain("solo se analizan");
    expect(outcome.assistantMessage).toContain("No se pudo leer la red");
  });
});
