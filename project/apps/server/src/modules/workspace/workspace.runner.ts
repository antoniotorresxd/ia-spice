import env from "@/lib/env";

import type { ArtifactStatus, BomItem, ExecutionStatus, MessageAttachment } from "./workspace.model";

export type AgentsVerdict = {
  status: string;
  reason: string;
  best_iteration: number | null;
};

export type AgentsOutcome =
  | { mode: "chat"; reply: string }
  | { mode: "clarify"; question: string; partial_spec: unknown }
  | { mode: "design" }
  | {
      mode: "analysis";
      // Informe en texto (nodos, mallas, reducción, Thévenin y la
      // verificación con ngspice); ausente si el análisis no llegó a correr.
      informe?: string;
      // "markdown": informe del motor simbólico (secciones y LaTeX); sin él, texto plano.
      formato?: "markdown";
      error?: string | null;
      resultados?: {
        validacion?: {
          coincide?: boolean;
          error?: string | null;
          // en la red transcrita no circula corriente: sus tensiones no prueban nada
          sin_corriente?: boolean;
          // la respuesta quedó en letras: ngspice no tuvo números que simular
          sin_verificar?: boolean;
          // Z_eq medida con una fuente de prueba de 1 V entre los terminales
          zeq?: { terminales?: [string, string]; coincide?: boolean; error?: string | null };
        };
      } & Record<string, unknown>;
    };

export type SimCurvePoint = { x: number; y: number };

export type BlockSimResult = {
  metrics: Record<string, number> | null;
  sim_error: string | null;
  curve?: SimCurvePoint[] | null;
  analysis_type?: string | null;
  x_unit?: string | null;
  y_unit?: string | null;
  x_label?: string | null;
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
  // Ausente en respuestas de versiones de agents anteriores a la lista de
  // materiales; por eso opcional.
  bom?: Record<string, BomItem[]>;
  documentation: Record<string, {
    summary: string;
    tags: string[];
    components: Record<string, string>;
    measurement_explanation: string;
    // Ausentes en agents anteriores al resumen para el chat y al paso a paso.
    chat_summary?: string;
    design_walkthrough?: string;
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
  designWalkthrough: string | null;
  bom: BomItem[] | null;
};

const LLM_UNAVAILABLE_PREFIX = "llm_settings_unavailable";
const LLM_UNAVAILABLE_SUMMARY =
  "No hay un modelo asignado al orquestador. Ve a Configuración → Modelos y providers.";
const IMAGE_INPUT_FAILED_PREFIX = "llm_image_input_failed";
const IMAGE_INPUT_FAILED_SUMMARY =
  "El orquestador no pudo leer las imágenes adjuntas. Es probable que el modelo asignado " +
  "al Orquestador no acepte imágenes: asigna uno con visión en Configuración → Modelos y " +
  "providers, o describe el circuito por texto.";
const NO_VERDICT_SUMMARY = "La corrida terminó sin veredicto.";

// Rechazos que no son de diseño sino de configuración: el mensaje del chat es
// la explicación tal cual, sin "no conseguí un diseño dentro de tolerancia".
const SETUP_REJECTIONS: Array<[prefix: string, summary: string]> = [
  [LLM_UNAVAILABLE_PREFIX, LLM_UNAVAILABLE_SUMMARY],
  [IMAGE_INPUT_FAILED_PREFIX, IMAGE_INPUT_FAILED_SUMMARY],
];

function setupRejectionSummary(verdict: AgentsVerdict | null): string | null {
  if (verdict?.status !== "rejected") return null;
  return SETUP_REJECTIONS.find(([prefix]) => verdict.reason.startsWith(prefix))?.[1] ?? null;
}

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
    return { status: "failed", summary: setupRejectionSummary(verdict) ?? verdict.reason };
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
      designWalkthrough: documentation?.design_walkthrough ?? null,
      bom: result.bom?.[blockId] ?? null,
    };
  });
}

const ACCEPTED_BY_TOLERANCE = "all blocks within tolerance";

// Una línea legible por bloque cuando el documentador no dio su resumen:
// la medición frente al objetivo, o por qué no hubo medición.
function blockResultLine(blockId: string, sim: BlockSimResult | undefined): string {
  if (!sim) return `**${blockId}**: sin resultado de simulación.`;
  if (sim.sim_error) return `**${blockId}**: la simulación falló (${sim.sim_error}).`;
  const measured = Object.entries(sim.metrics ?? {}).map(([metric, value]) => {
    const target = metric === sim.metric_name ? sim.target_value : null;
    if (target == null || target === 0) return `${metric} = ${value}`;
    const error = Number(((Math.abs(value - target) / Math.abs(target)) * 100).toPrecision(2));
    return `${metric} = ${value} (objetivo ${target}, error ${error} %)`;
  });
  return `**${blockId}**: ${measured.join(", ") || "sin métricas medidas."}`;
}

// El mensaje final de un diseño, en lenguaje de persona: el resumen que
// escribió el documentador para cada bloque o, si no lo hay, una línea
// redactada con la medición. Nunca el volcado crudo de `bloque.métrica`.
export function toAssistantMessage(result: AgentsRunResult): string {
  const blockIds = Object.keys(result.netlists ?? {}).length
    ? Object.keys(result.netlists)
    : Object.keys(result.sim_results ?? {});
  const documentation = result.documentation ?? {};
  const summaries = blockIds.map(
    (blockId) => documentation[blockId]?.chat_summary || blockResultLine(blockId, result.sim_results?.[blockId]),
  );
  const documented = blockIds.some((blockId) => documentation[blockId]?.chat_summary);

  if (documented) {
    const walkthrough = blockIds.some((blockId) => documentation[blockId]?.design_walkthrough)
      ? "\n\n_El paso a paso del diseño está en la pestaña **Cómo se diseñó** del visualizador._"
      : "";
    return summaries.join("\n\n") + walkthrough;
  }

  const setup = setupRejectionSummary(result.verdict);
  if (setup && summaries.length === 0) return setup;

  // iteration es 0-based en CircuitState; lo que interesa es cuántas corrió
  const runs = result.iteration + 1;
  const iterations = `${runs} ${runs === 1 ? "iteración" : "iteraciones"}`;
  const verdict = result.verdict;
  const header =
    verdict?.status === "accepted"
      ? verdict.reason === ACCEPTED_BY_TOLERANCE
        ? `El diseño quedó dentro de tolerancia en ${iterations}.`
        : `Diseño aceptado en ${iterations}: ${verdict.reason}.`
      : verdict?.status === "rejected"
        ? `No conseguí un diseño dentro de tolerancia: ${mapVerdictToStatus(verdict).summary}`
        : mapVerdictToStatus(verdict).summary;

  return summaries.length ? `${header}\n\n${summaries.map((line) => `- ${line}`).join("\n")}` : header;
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
  mode: "chat" | "clarify" | "design" | "analysis";
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

  if (result.outcome?.mode === "analysis") {
    return resolveAnalysisOutcome(result, result.outcome, previousNormalizedSpec);
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

const ANALYSIS_UNREADABLE = "No se pudo analizar la red.";

type AnalysisValidation = NonNullable<
  NonNullable<Extract<AgentsOutcome, { mode: "analysis" }>["resultados"]>["validacion"]
>;

// Qué confirmó ngspice: la Z_eq entre los terminales o las tensiones de
// nodo. Una red sin corriente no confirma nada aunque sus tensiones coincidan.
function analysisSummary(validacion: AnalysisValidation | undefined): string {
  const zeq = validacion?.zeq;
  if (validacion?.coincide) {
    return zeq?.coincide && zeq.terminales
      ? `Red analizada; ngspice confirma la Z_eq entre ${zeq.terminales[0]} y ${zeq.terminales[1]}.`
      : "Red analizada; ngspice confirma las tensiones de nodo.";
  }
  if (validacion?.sin_verificar) {
    return "Red analizada; la respuesta queda en letras, así que ngspice no tuvo números que simular.";
  }
  if (validacion?.sin_corriente && !zeq) {
    return "Red analizada, pero no hay nada que verificar: en la red transcrita no circula corriente.";
  }
  return "Red analizada, pero ngspice no confirmó el resultado.";
}

// Un análisis no tiene veredicto de diseño: se completa si la red se pudo
// resolver, y el resumen dice si ngspice confirmó la respuesta.
function resolveAnalysisOutcome(
  result: AgentsRunResult,
  outcome: Extract<AgentsOutcome, { mode: "analysis" }>,
  previousNormalizedSpec: unknown | null,
): RunOutcome {
  const informe = outcome.informe ?? outcome.error ?? ANALYSIS_UNREADABLE;
  const validacion = outcome.resultados?.validacion;
  // Sin `validacion` la red ni siquiera se pudo leer: no hubo análisis.
  const solved = Boolean(validacion);
  const summary = !solved
    ? (outcome.error ?? ANALYSIS_UNREADABLE)
    : analysisSummary(validacion);
  return {
    status: solved ? "completed" : "failed",
    summary,
    // El chat renderiza Markdown; el informe es texto con columnas y `*` de
    // las ecuaciones, así que va en un bloque de texto que lo deja intacto.
    // El del motor simbólico ya viene en Markdown con LaTeX y va tal cual.
    assistantMessage: solved && outcome.formato !== "markdown" ? "```text\n" + informe + "\n```" : informe,
    normalizedSpec: previousNormalizedSpec,
    artifacts: toArtifactDrafts(result),
    mode: "analysis",
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

// Un análisis solo corre interpretación, cálculo (las ecuaciones) y la
// verificación con ngspice: no hay curación ni documentación. Las ejecuciones
// arrancan con las cinco etapas de diseño porque el modo se sabe tarde, así
// que hay que podarlas — también en análisis viejos guardados con las cinco.
const ANALYSIS_STAGE_KINDS: StageKind[] = ["interpretation", "calculation", "simulation"];

export function toAnalysisStages(stages: ExecutionStage[]): ExecutionStage[] {
  return ANALYSIS_STAGE_KINDS.flatMap((kind) => {
    const stage = stages.find((item) => item.kind === kind);
    if (!stage) return [];
    // ngspice no simula un diseño: verifica lo que resolvieron las ecuaciones
    return kind === "simulation" ? [{ ...stage, label: "Verificación", actor: "ngspice" }] : [stage];
  });
}

// El sumidero se inyecta para que todo el camino de red se pruebe en memoria:
// sin él, comprobar la forma de la petición exigiría una base de datos.
export type RunSink = {
  onStageUpdate?(stage: ExecutionStage): Promise<void> | void;
  // agents avisa el modo en cuanto el orquestador lo decide (hoy, solo el de
  // análisis), antes del resultado final.
  onModeDetected?(mode: RunOutcome["mode"]): Promise<void> | void;
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
    // Las imágenes del mensaje de este turno (no las de turnos anteriores).
    images?: MessageAttachment[];
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
        // Solo si las hay: sin imágenes la petición queda como siempre.
        ...(input.images?.length
          ? {
              images: input.images.map((image) => ({ media_type: image.mediaType, data: image.data })),
            }
          : {}),
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
              } else if (currentEvent === "mode") {
                await sink.onModeDetected?.(data.mode);
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

