import type { ArtifactStatus, ExecutionStatus } from "./workspace.model";

export type AgentsVerdict = {
  status: string;
  reason: string;
  best_iteration: number | null;
};

export type AgentsRunResult = {
  verdict: AgentsVerdict | null;
  normalized_spec: unknown | null;
  netlists: Record<string, { path: string; text: string }>;
  sim_results: Record<string, { metrics: Record<string, number> | null; sim_error: string | null }>;
  component_values: Record<string, Record<string, number>>;
  history: unknown[];
  iteration: number;
};

export type ArtifactDraft = {
  blockId: string;
  name: string;
  language: string;
  content: string;
  status: ArtifactStatus;
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
  return Object.entries(result.netlists ?? {}).map(([blockId, netlist]) => ({
    blockId,
    name: `${blockId}.cir`,
    language: "spice",
    content: netlist.text,
    // parcial cuando ngspice no pudo medir ese bloque: el netlist existe,
    // la validación no
    status: result.sim_results?.[blockId]?.sim_error == null ? "complete" : "partial",
  }));
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
