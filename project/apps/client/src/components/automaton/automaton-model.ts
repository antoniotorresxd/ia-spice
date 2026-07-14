export type AutomatonStateId =
  | 'start'
  | 'orchestrator'
  | 'calculation'
  | 'synthesis'
  | 'curator'
  | 'accepted'
  | 'rejected'

export type AutomatonEdgeId =
  | 'entry'
  | 'valid'
  | 'values'
  | 'metrics'
  | 'adjust'
  | 'accept'
  | 'reject'
  | 'invalid'

export const AUTOMATON_TONES = [
  'main',
  'violet',
  'terminal',
  'muted',
] as const

export type AutomatonTone = (typeof AUTOMATON_TONES)[number]

export interface AutomatonState {
  readonly id: AutomatonStateId
  readonly label: string
  readonly caption: string
  readonly x: number
  readonly y: number
  readonly tone: AutomatonTone
}

export interface AutomatonEdge {
  readonly id: AutomatonEdgeId
  readonly from: AutomatonStateId
  readonly to: AutomatonStateId
  readonly label: string
  readonly path: string
  readonly labelX: number
  readonly labelY: number
  readonly tone: AutomatonTone
}

export const AUTOMATON_STATES = [
  {
    id: 'start',
    label: 'Inicio',
    caption: 'ENTRADA',
    x: 70,
    y: 205,
    tone: 'main',
  },
  {
    id: 'orchestrator',
    label: 'Orquestador',
    caption: 'AGENTE',
    x: 220,
    y: 205,
    tone: 'main',
  },
  {
    id: 'calculation',
    label: 'Cálculo',
    caption: 'ANÁLISIS',
    x: 350,
    y: 105,
    tone: 'main',
  },
  {
    id: 'synthesis',
    label: 'Síntesis',
    caption: 'CIRCUITO',
    x: 520,
    y: 105,
    tone: 'main',
  },
  {
    id: 'curator',
    label: 'Curador',
    caption: 'EVALUACIÓN',
    x: 520,
    y: 305,
    tone: 'violet',
  },
  {
    id: 'accepted',
    label: 'Aceptado',
    caption: 'SALIDA',
    x: 735,
    y: 105,
    tone: 'terminal',
  },
  {
    id: 'rejected',
    label: 'Rechazado',
    caption: 'REVISIÓN',
    x: 735,
    y: 305,
    tone: 'muted',
  },
] as const satisfies readonly AutomatonState[]

export const AUTOMATON_EDGES = [
  {
    id: 'entry',
    from: 'start',
    to: 'orchestrator',
    label: 'Entrada',
    path: 'M 126 205 H 160',
    labelX: 143,
    labelY: 178,
    tone: 'main',
  },
  {
    id: 'valid',
    from: 'orchestrator',
    to: 'calculation',
    label: 'Válido',
    path: 'M 262 177 C 275 140 290 112 294 107',
    labelX: 272,
    labelY: 135,
    tone: 'main',
  },
  {
    id: 'values',
    from: 'calculation',
    to: 'synthesis',
    label: 'Valores',
    path: 'M 406 105 H 464',
    labelX: 435,
    labelY: 91,
    tone: 'main',
  },
  {
    id: 'metrics',
    from: 'synthesis',
    to: 'curator',
    label: 'Métricas',
    path: 'M 520 133 V 277',
    labelX: 553,
    labelY: 209,
    tone: 'main',
  },
  {
    id: 'adjust',
    from: 'curator',
    to: 'synthesis',
    label: 'Ajustar',
    path: 'M 475 277 C 394 245 394 165 475 133',
    labelX: 401,
    labelY: 209,
    tone: 'violet',
  },
  {
    id: 'accept',
    from: 'curator',
    to: 'accepted',
    label: 'Aceptar',
    path: 'M 565 278 C 626 249 654 161 688 130',
    labelX: 630,
    labelY: 210,
    tone: 'main',
  },
  {
    id: 'reject',
    from: 'curator',
    to: 'rejected',
    label: 'Rechazar',
    path: 'M 576 305 H 679',
    labelX: 627,
    labelY: 291,
    tone: 'muted',
  },
  {
    id: 'invalid',
    from: 'orchestrator',
    to: 'rejected',
    label: 'Inválido',
    path: 'M 262 233 C 360 390 585 370 679 320',
    labelX: 458,
    labelY: 365,
    tone: 'muted',
  },
] as const satisfies readonly AutomatonEdge[]

export const AUTOMATON_TIMELINE = [
  { state: 'orchestrator', edge: 'entry' },
  { state: 'calculation', edge: 'valid' },
  { state: 'synthesis', edge: 'values' },
  { state: 'curator', edge: 'metrics' },
  { state: 'synthesis', edge: 'adjust' },
  { state: 'curator', edge: 'metrics' },
  { state: 'accepted', edge: 'accept' },
  { state: 'accepted', edge: null },
] as const
