export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai_compatible'

export type AgentId = 'orchestrator' | 'calculation' | 'writer' | 'curator'

export type ConnectionTestStatus = 'ok' | 'failed'

export type UserProfile = {
  name: string
  email: string
  avatarUrl: string | null
}

export type ConnectionInput = {
  label: string
  provider: LlmProvider
  apiKey: string
  baseUrl: string
}

export type LlmConnection = {
  id: string
  label: string
  provider: LlmProvider
  baseUrl: string | null
  hasKey: boolean
  keyHint: string | null
  lastTestStatus: ConnectionTestStatus | null
  lastTestedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ConnectionTestResult = { ok: true } | { ok: false; error: string }

export type AgentAssignment = {
  agentId: AgentId
  label: string
  connectionId: string | null
  model: string
}

export type AgentAssignmentInput = Pick<
  AgentAssignment,
  'connectionId' | 'model'
>

// El texto de los agentes es copy de la interfaz, no dato del server.
export const AGENT_LABELS: Record<AgentId, string> = {
  orchestrator: 'Orquestador',
  calculation: 'Cálculo',
  writer: 'Escritura',
  curator: 'Curador',
}

export const AGENT_ORDER: AgentId[] = ['orchestrator', 'calculation', 'writer', 'curator']
