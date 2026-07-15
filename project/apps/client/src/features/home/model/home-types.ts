export type UsagePeriod = '7d' | '30d' | '90d'

export type StageKind =
  | 'interpretation'
  | 'calculation'
  | 'simulation'
  | 'curation'
  | 'result'

export type StageStatus = 'pending' | 'active' | 'completed' | 'failed'

export type GeneratedFile = {
  id: string
  name: string
  kind: 'netlist' | 'data' | 'schematic' | 'report'
  partial: boolean
}

export type ExecutionStage = {
  id: string
  kind: StageKind
  label: string
  actor: string
  status: StageStatus
  durationMs: number | null
  summary: string
  metrics: Array<{ label: string; value: string }>
}

export type ConversationSummary = {
  id: string
  title: string
  projectId: string | null
  isTemporary: boolean
  updatedAt: string
}

export type ConversationExecution = {
  id: string
  projectId: string | null
  conversation: ConversationSummary
  status: 'active' | 'completed' | 'failed'
  stages: ExecutionStage[]
  files: GeneratedFile[]
}

export type UsageMetrics = {
  period: UsagePeriod
  tokens: { used: number; limit: number } | null
  estimatedCostUsd: number | null
  executions: number
  successRate: number
  processingMinutes: number
  generatedFiles: number
}

export type HomeOverviewData = {
  usage: UsageMetrics
  recentProjects: Array<{
    id: string
    name: string
    conversationCount: number
  }>
  recentConversations: ConversationSummary[]
  recentFiles: GeneratedFile[]
  recentExecutions: ConversationExecution[]
  isDemo: true
}

export type PromptInput = { text: string }

