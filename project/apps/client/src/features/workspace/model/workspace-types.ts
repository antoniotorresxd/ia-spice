import type { ExecutionStage } from '@/features/home/model/home-types'

export type WorkspaceExecutionStatus = 'active' | 'completed' | 'failed'

export type WorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type SimCurvePoint = { x: number; y: number }

export type BlockSimResult = {
  metrics: Record<string, number> | null
  sim_error: string | null
  curve?: SimCurvePoint[] | null
  analysis_type?: string | null
  x_unit?: string | null
  y_unit?: string | null
  metric_name?: string | null
  measured_value?: number | null
  target_value?: number | null
}

export type WorkspaceExecution = {
  id: string
  status: WorkspaceExecutionStatus
  summary: string
  mode?: 'chat' | 'clarify' | 'design'
  stages?: ExecutionStage[]
  simResults?: Record<string, BlockSimResult> | null
}

export type WorkspaceFile = {
  id: string
  name: string
  language: string
  content: string
  status: 'complete' | 'partial'
  summary: string | null
  tags: string[] | null
  components: Record<string, string> | null
  measurementExplanation: string | null
  simResult?: BlockSimResult | null
}

export type TraceGeneration = {
  name: string
  model: string
  input: unknown
  output: unknown
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  } | null
  latency_s?: number | null
  status_message?: string | null
  level?: string | null
}

export type ExecutionTraceData = {
  id?: string
  name?: string
  timestamp?: string
  latency_s?: number | null
  status?: string
  total_tokens?: number
  generations?: TraceGeneration[]
}

export type TraceResponse = {
  status: 'ok' | 'unavailable' | 'not_found'
  executionId?: string | null
  message?: string
  trace?: ExecutionTraceData
}

export type WorkspaceFileItem = {
  id: string
  conversationId: string
  name: string
  language: string
  status: 'complete' | 'partial'
  createdAt: string
  conversationTitle: string
  projectId: string | null
}

export type WorkspaceConversation = {
  id: string
  projectId: string | null
  title: string
  preview: string
  updatedAt: string
  executionStatus: WorkspaceExecutionStatus
}

export type WorkspaceConversationDetail = WorkspaceConversation & {
  messages: WorkspaceMessage[]
  files: WorkspaceFile[]
  execution: WorkspaceExecution
}

export type WorkspaceProject = {
  id: string
  name: string
  description: string
  conversationIds: string[]
  fileCount: number
  updatedAt: string
}

export type WorkspaceProjectDetail = WorkspaceProject & {
  conversations: WorkspaceConversation[]
}

export type WorkspaceSnapshot = {
  projects: WorkspaceProject[]
  conversations: WorkspaceConversation[]
  unassignedConversationIds: string[]
}

export type ProjectInput = {
  name: string
  description: string
}
