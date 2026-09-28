import type {
  ConversationExecution,
  ConversationSummary,
  GeneratedFile,
  HomeOverviewData,
  UsageMetrics,
  UsagePeriod,
} from './home-types'

const generatedFiles: GeneratedFile[] = [
  { id: 'file-circuit', name: 'circuit.cir', kind: 'netlist', partial: false },
  { id: 'file-response', name: 'response.csv', kind: 'data', partial: false },
  {
    id: 'file-schematic',
    name: 'schematic.svg',
    kind: 'schematic',
    partial: false,
  },
  { id: 'file-report', name: 'report.pdf', kind: 'report', partial: false },
]

export const draftConversationFixture: ConversationSummary = {
  id: 'conversation-draft',
  title: 'Filtro RC de 1 kHz',
  projectId: null,
  isTemporary: true,
  updatedAt: '2026-07-15T16:42:00.000Z',
}

export const activeDraftExecutionFixture: ConversationExecution = {
  id: 'execution-active',
  projectId: null,
  conversation: draftConversationFixture,
  status: 'active',
  stages: [
    {
      id: 'stage-interpretation',
      kind: 'interpretation',
      label: 'Interpretación',
      actor: 'Orquestador',
      status: 'completed',
      durationMs: 800,
      summary: 'Interpretó la solicitud y normalizó las restricciones.',
      metrics: [
        { label: 'fc', value: '1 kHz' },
        { label: 'Vcc', value: '5 V' },
      ],
    },
    {
      id: 'stage-calculation',
      kind: 'calculation',
      label: 'Cálculo',
      actor: 'Cálculo',
      status: 'completed',
      durationMs: 2400,
      summary: 'Seleccionó valores comerciales para R y C.',
      metrics: [
        { label: 'R', value: '1.6 kΩ' },
        { label: 'C', value: '100 nF' },
      ],
    },
    {
      id: 'stage-simulation',
      kind: 'simulation',
      label: 'Simulación',
      actor: 'NGSpice',
      status: 'completed',
      durationMs: 1700,
      summary: 'Ejecutó el análisis AC y generó los entregables.',
      metrics: [
        { label: 'fc simulada', value: '994.7 Hz' },
        { label: 'error', value: '0.53 %' },
      ],
    },
    {
      id: 'stage-curation',
      kind: 'curation',
      label: 'Curación',
      actor: 'Curador',
      status: 'active',
      durationMs: null,
      summary: 'Validando tolerancias y consistencia del resultado.',
      metrics: [],
    },
    {
      id: 'stage-result',
      kind: 'result',
      label: 'Resultado',
      actor: 'Ecosistema',
      status: 'pending',
      durationMs: null,
      summary: 'El resultado estará disponible al terminar la validación.',
      metrics: [],
    },
  ],
  files: generatedFiles,
}

export const completedExecutionFixture: ConversationExecution = {
  ...activeDraftExecutionFixture,
  id: 'execution-completed',
  projectId: 'project-filter',
  status: 'completed',
  conversation: {
    ...draftConversationFixture,
    id: 'conversation-filter',
    projectId: 'project-filter',
    isTemporary: false,
  },
  stages: activeDraftExecutionFixture.stages.map((stage) => ({
    ...stage,
    status: 'completed',
    durationMs: stage.durationMs ?? 600,
  })),
}

export const failedExecutionFixture: ConversationExecution = {
  ...completedExecutionFixture,
  id: 'execution-failed',
  status: 'failed',
  conversation: {
    ...completedExecutionFixture.conversation,
    id: 'conversation-amplifier',
    title: 'Amplificador BJT',
  },
  stages: activeDraftExecutionFixture.stages.map((stage) =>
    stage.kind === 'simulation'
      ? {
          ...stage,
          status: 'failed',
          summary: 'La simulación no convergió.',
          metrics: [{ label: 'intentos', value: '3' }],
        }
      : stage.kind === 'curation' || stage.kind === 'result'
        ? { ...stage, status: 'pending' }
        : { ...stage, status: 'completed' },
  ),
  files: [
    {
      id: 'file-partial',
      name: 'partial-output.csv',
      kind: 'data',
      partial: true,
    },
  ],
}

export const defaultAgentBreakdown = [
  {
    nodeId: 'orquestador' as const,
    label: 'Orquestador (Intención & NLP)',
    callCount: 66,
    avgLatencyMs: 1420,
    tokens: 98_400,
    successRate: 0.98,
  },
  {
    nodeId: 'calculo' as const,
    label: 'Cálculo (Fórmulas Analíticas)',
    callCount: 27,
    avgLatencyMs: 220,
    tokens: 0,
    successRate: 1.0,
  },
  {
    nodeId: 'sintesis' as const,
    label: 'Síntesis & Shell (NGSpice)',
    callCount: 84,
    avgLatencyMs: 28,
    tokens: 0,
    successRate: 0.97,
  },
  {
    nodeId: 'curador' as const,
    label: 'Curador (Loop RL & Ajuste)',
    callCount: 81,
    avgLatencyMs: 2650,
    tokens: 285_100,
    successRate: 0.94,
  },
  {
    nodeId: 'documentador' as const,
    label: 'Documentador (Síntesis)',
    callCount: 24,
    avgLatencyMs: 78,
    tokens: 51_963,
    successRate: 1.0,
  },
]

export const defaultModelDistribution = [
  {
    modelName: 'models/gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    tokens: 227_887,
    percentage: 52.3,
    callCount: 42,
  },
  {
    modelName: 'google/gemma-4-12b',
    label: 'Gemma 4 12B (Local/vLLM)',
    tokens: 175_394,
    percentage: 40.3,
    callCount: 37,
  },
  {
    modelName: 'models/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    tokens: 32_182,
    percentage: 7.4,
    callCount: 6,
  },
]

export const usageByPeriod: Record<UsagePeriod, UsageMetrics> = {
  '7d': {
    period: '7d',
    tokens: { used: 48_600, limit: 125_000 },
    estimatedCostUsd: 1.06,
    executions: 8,
    successRate: 0.875,
    processingMinutes: 18,
    generatedFiles: 21,
    avgLatencyMs: 1280,
    timeSeries: [
      { date: '2026-09-21', tokens: 5_200, executions: 1, costUsd: 0.11 },
      { date: '2026-09-22', tokens: 12_400, executions: 2, costUsd: 0.25 },
      { date: '2026-09-23', tokens: 18_200, executions: 3, costUsd: 0.40 },
      { date: '2026-09-24', tokens: 7_800, executions: 1, costUsd: 0.16 },
      { date: '2026-09-25', tokens: 9_200, executions: 2, costUsd: 0.19 },
      { date: '2026-09-26', tokens: 6_400, executions: 1, costUsd: 0.13 },
      { date: '2026-09-27', tokens: 13_500, executions: 2, costUsd: 0.31 },
    ],
    agentBreakdown: defaultAgentBreakdown.map((item) => ({
      ...item,
      callCount: Math.round(item.callCount * 0.35),
      tokens: Math.round(item.tokens * 0.35),
    })),
    modelDistribution: defaultModelDistribution.map((item) => ({
      ...item,
      tokens: Math.round(item.tokens * 0.35),
      callCount: Math.max(1, Math.round(item.callCount * 0.35)),
    })),
  },
  '30d': {
    period: '30d',
    tokens: { used: 184_200, limit: 500_000 },
    estimatedCostUsd: 3.84,
    executions: 31,
    successRate: 0.903,
    processingMinutes: 74,
    generatedFiles: 86,
    avgLatencyMs: 1350,
    timeSeries: [
      { date: '2026-09-01', tokens: 6_200, executions: 1, costUsd: 0.12 },
      { date: '2026-09-05', tokens: 9_400, executions: 2, costUsd: 0.20 },
      { date: '2026-09-09', tokens: 14_800, executions: 3, costUsd: 0.31 },
      { date: '2026-09-13', tokens: 21_888, executions: 4, costUsd: 0.45 },
      { date: '2026-09-14', tokens: 62_100, executions: 11, costUsd: 1.30 },
      { date: '2026-09-17', tokens: 18_400, executions: 3, costUsd: 0.38 },
      { date: '2026-09-20', tokens: 24_600, executions: 4, costUsd: 0.51 },
      { date: '2026-09-22', tokens: 34_700, executions: 6, costUsd: 0.72 },
      { date: '2026-09-23', tokens: 36_400, executions: 7, costUsd: 0.75 },
      { date: '2026-09-25', tokens: 16_500, executions: 3, costUsd: 0.34 },
      { date: '2026-09-27', tokens: 20_280, executions: 4, costUsd: 0.44 },
    ],
    agentBreakdown: defaultAgentBreakdown,
    modelDistribution: defaultModelDistribution,
  },
  '90d': {
    period: '90d',
    tokens: { used: 421_900, limit: 1_500_000 },
    estimatedCostUsd: 8.72,
    executions: 76,
    successRate: 0.921,
    processingMinutes: 183,
    generatedFiles: 214,
    avgLatencyMs: 1310,
    timeSeries: [
      { date: '2026-07-15', tokens: 42_000, executions: 8, costUsd: 0.88 },
      { date: '2026-08-01', tokens: 78_000, executions: 14, costUsd: 1.60 },
      { date: '2026-08-15', tokens: 95_000, executions: 17, costUsd: 1.95 },
      { date: '2026-09-01', tokens: 56_000, executions: 10, costUsd: 1.15 },
      { date: '2026-09-13', tokens: 21_888, executions: 4, costUsd: 0.45 },
      { date: '2026-09-14', tokens: 62_100, executions: 11, costUsd: 1.30 },
      { date: '2026-09-22', tokens: 34_700, executions: 6, costUsd: 0.72 },
      { date: '2026-09-23', tokens: 32_212, executions: 6, costUsd: 0.67 },
    ],
    agentBreakdown: defaultAgentBreakdown.map((item) => ({
      ...item,
      callCount: Math.round(item.callCount * 1.8),
      tokens: Math.round(item.tokens * 1.7),
    })),
    modelDistribution: defaultModelDistribution,
  },
}

export const unavailableUsageFixture: UsageMetrics = {
  ...usageByPeriod['30d'],
  tokens: null,
  estimatedCostUsd: null,
}

export const homeOverviewFixture: HomeOverviewData = {
  usage: usageByPeriod['30d'],
  recentProjects: [
    { id: 'project-filter', name: 'Filtros analógicos', conversationCount: 4 },
    { id: 'project-power', name: 'Fuente regulada', conversationCount: 3 },
    { id: 'project-amp', name: 'Amplificador BJT', conversationCount: 2 },
  ],
  recentConversations: [
    completedExecutionFixture.conversation,
    failedExecutionFixture.conversation,
    draftConversationFixture,
  ],
  recentFiles: generatedFiles,
  recentExecutions: [
    activeDraftExecutionFixture,
    completedExecutionFixture,
    failedExecutionFixture,
  ],
  isDemo: true,
}

export const emptyHomeOverviewFixture: HomeOverviewData = {
  ...homeOverviewFixture,
  recentProjects: [],
  recentConversations: [],
  recentFiles: [],
  recentExecutions: [],
}

