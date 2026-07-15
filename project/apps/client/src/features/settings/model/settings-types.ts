export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai_compatible'

export type AgentId = 'orchestrator' | 'calculation' | 'writer' | 'curator'

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
  createdAt: string
  updatedAt: string
}

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
