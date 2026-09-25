import env from "@/lib/env";

import type { ArtifactStatus, ExecutionStatus } from "./workspace.model";

export type AgentsVerdict = {
  status: string;
  reason: string;
  best_iteration: number | null;
};

export type AgentsOutcome =
  | { mode: "chat"; reply: string }
  | { mode: "clarify"; question: string; partial_spec: unknown }
  | { mode: "design" };

export type SimCurvePoint = { x: number; y: number };

export type BlockSimResult = {
  metrics: Record<string, number> | null;
  sim_error: string | null;
  curve?: SimCurvePoint[] | null;
  analysis_type?: string | null;
  x_unit?: string | null;
  y_unit?: string | null;
  metric_name?: string | null;
  measured_value?: number | null;
  target_value?: number | null;
};

export type AgentsRunResult = {
  outcome: AgentsOutcome | null;
  verdict: AgentsVerdict | null;
  normalized_spec: unknown | null;
  netlists: Record<string, { path: string; text: string }>;
  sim_results: Record<string, BlockSimResult>;
  component_values: Record<string, Record<string, number>>;
  documentation: Record<string, {
    summary: string;
    tags: string[];
    components: Record<string, string>;
    measurement_explanation: string;
  } | null> | null;
  history: unknown[];
  iteration: number;
};

export type ArtifactDraft = {
  blockId: string;
  name: string;
  language: string;
  content: string;
  status: ArtifactStatus;
  summary: string | null;
  tags: string[] | null;
  components: Record<string, string> | null;
  measurementExplanation: string | null;
};

const LLM_UNAVAILABLE_PREFIX = "llm_settings_unavailable";
const LLM_UNAVAILABLE_SUMMARY =
  "No hay un modelo asignado al orquestador. Ve a Configuración → Modelos y providers.";
const NO_VERDICT_SUMMARY = "La corrida terminó sin veredicto.";

// Un circuito rechazado no es un error técnico, pero para la interfaz es un
// resultado fallido: no obtuviste un circuito. El motivo va en el resumen.
export function mapVerdictToStatus(verdict: AgentsVerdict | null): {
  status: Extract<ExecutionStatus, "completed" | "failed">;
  summary: string;
} {
  if (verdict?.status === "accepted") {
    return { status: "completed", summary: verdict.reason };
  }
  if (verdict?.status === "rejected") {
    return {
      status: "failed",
      summary: verdict.reason.startsWith(LLM_UNAVAILABLE_PREFIX)
        ? LLM_UNAVAILABLE_SUMMARY
        : verdict.reason,
    };
  }
  return { status: "failed", summary: NO_VERDICT_SUMMARY };
}

export function toArtifactDrafts(result: AgentsRunResult): ArtifactDraft[] {
  return Object.entries(result.netlists ?? {}).map(([blockId, netlist]) => {
    const documentation = result.documentation?.[blockId];
    return {
      blockId,
      name: `${blockId}.cir`,
      language: "spice",
      content: netlist.text,
      // parcial cuando ngspice no pudo medir ese bloque: el netlist existe,
      // la validación no
      status: result.sim_results?.[blockId]?.sim_error == null ? "complete" : "partial",
      summary: documentation?.summary ?? null,
      tags: documentation?.tags ?? null,
      components: documentation?.components ?? null,
      measurementExplanation: documentation?.measurement_explanation ?? null,
    };
  });
}

export function toAssistantMessage(result: AgentsRunResult): string {
  const { summary } = mapVerdictToStatus(result.verdict);

  const lines = Object.entries(result.sim_results ?? {}).flatMap(([blockId, sim]) =>
    sim.metrics
      ? Object.entries(sim.metrics).map(([metric, value]) => `${blockId}.${metric} = ${value}`)
      : [`${blockId}: ${sim.sim_error}`],
  );

  // iteration es 0-based en CircuitState; lo que interesa es cuántas corrió
  const iterations = `Iteraciones: ${result.iteration + 1}`;

  return lines.length > 0
    ? `${summary}\n\n${lines.join("\n")}\n${iterations}`
    : `${summary}\n\n${iterations}`;
}

export type RunOutcome = {
  status: Extract<ExecutionStatus, "completed" | "failed">;
  summary: string;
  assistantMessage: string;
  normalizedSpec: unknown | null;
  // null = no tocar la tabla de artefactos (turno de chat/clarify sobre una
  // conversación que ya tenía un diseño vigente); array = reemplazo
  // completo, igual que el camino de diseño de siempre.
  artifacts: ArtifactDraft[] | null;
  mode: "chat" | "clarify" | "design";
};

export function resolveRunOutcome(result: AgentsRunResult, previousNormalizedSpec: unknown | null = null): RunOutcome {
  if (result.outcome?.mode === "chat") {
    return {
      status: "completed",
      summary: result.outcome.reply,
      assistantMessage: result.outcome.reply,
      normalizedSpec: previousNormalizedSpec,
      artifacts: null,
      mode: "chat",
    };
  }

  if (result.outcome?.mode === "clarify") {
    return {
      status: "completed",
      summary: result.outcome.question,
      assistantMessage: result.outcome.question,
      normalizedSpec: result.outcome.partial_spec,
      artifacts: null,
      mode: "clarify",
    };
  }

  const { status, summary } = mapVerdictToStatus(result.verdict);
  return {
    status,
    summary,
    assistantMessage: toAssistantMessage(result),
    normalizedSpec: result.normalized_spec,
    artifacts: toArtifactDrafts(result),
    mode: "design",
  };
}

export type StageKind =
  | "interpretation"
  | "calculation"
  | "simulation"
  | "curation"
  | "result";

export type StageStatus = "pending" | "active" | "completed" | "failed";

export type ExecutionStage = {
  id: string;
  kind: StageKind;
  label: string;
  actor: string;
  status: StageStatus;
  durationMs: number | null;
  summary: string;
  metrics: Array<{ label: string; value: string }>;
};

// El sumidero se inyecta para que todo el camino de red se pruebe en memoria:
// sin él, comprobar la forma de la petición exigiría una base de datos.
export type RunSink = {
  onStageUpdate?(stage: ExecutionStage): Promise<void> | void;
  onResult(result: AgentsRunResult): Promise<void>;
  onFailure(summary: string): Promise<void>;
};

const RUN_FAILURE_SUMMARY = "No pudimos ejecutar el diseño. Inténtalo de nuevo.";

export async function startRun(
  input: {
    userId: string;
    requestText: string;
    executionId: string;
    maxIterations?: number;
    tolerance?: number;
  },
  sink: RunSink,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl(`${env.AGENTS_BASE_URL}/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.AGENTS_API_TOKEN}`,
        accept: "text/event-stream, application/json",
      },
      // executionId viaja como identidad estable de la corrida: agents lo usa
      // como thread_id de su checkpointer, así que reenviar una ejecución
      // interrumpida la retoma desde su último punto guardado en lugar de
      // recomenzarla (RNF-03.2).
      body: JSON.stringify({
        user_id: input.userId,
        request_text: input.requestText,
        execution_id: input.executionId,
        max_iterations: input.maxIterations,
        tolerance: input.tolerance,
      }),
    });

    if (!response.ok) {
      // El cuerpo del error puede traer detalles internos: no se propaga.
      await sink.onFailure(RUN_FAILURE_SUMMARY);
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: AgentsRunResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === "stage") {
                await sink.onStageUpdate?.(data as ExecutionStage);
              } else if (currentEvent === "done") {
                finalResult = data as AgentsRunResult;
              } else if (currentEvent === "error") {
                const errorSummary = data.error ? `Error al simular: ${data.error}` : RUN_FAILURE_SUMMARY;
                await sink.onFailure(errorSummary);
                return;
              }
            } catch {
              // ignora fragmentos de JSON inválidos en el buffer
            }
          }
        }
      }

      if (finalResult) {
        await sink.onResult(finalResult);
        return;
      }
      await sink.onFailure(RUN_FAILURE_SUMMARY);
      return;
    }

    const result = (await response.json()) as AgentsRunResult;
    await sink.onResult(result);
  } catch {
    await sink.onFailure(RUN_FAILURE_SUMMARY);
  }
}

