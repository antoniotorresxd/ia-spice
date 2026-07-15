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

export const usageByPeriod: Record<UsagePeriod, UsageMetrics> = {
  '7d': {
    period: '7d',
    tokens: { used: 48_600, limit: 125_000 },
    estimatedCostUsd: 1.06,
    executions: 8,
    successRate: 0.875,
    processingMinutes: 18,
    generatedFiles: 21,
  },
  '30d': {
    period: '30d',
    tokens: { used: 184_200, limit: 500_000 },
    estimatedCostUsd: 3.84,
    executions: 31,
    successRate: 0.903,
    processingMinutes: 74,
    generatedFiles: 86,
  },
  '90d': {
    period: '90d',
    tokens: { used: 421_900, limit: 1_500_000 },
    estimatedCostUsd: 8.72,
    executions: 76,
    successRate: 0.921,
    processingMinutes: 183,
    generatedFiles: 214,
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

