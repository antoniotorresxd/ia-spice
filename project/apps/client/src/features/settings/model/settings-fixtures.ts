import type {
  AgentAssignment,
  LlmConnection,
  UserProfile,
} from './settings-types'

export const userProfileFixture: UserProfile = {
  name: 'Antonio',
  email: 'antonio@example.com',
  avatarUrl: null,
}

export const connectionsFixture: LlmConnection[] = [
  {
    id: 'connection-openai',
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: null,
    hasKey: true,
    keyHint: '7890',
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
  },
]

export const agentAssignmentsFixture: AgentAssignment[] = [
  { agentId: 'orchestrator', label: 'Orquestador', connectionId: 'connection-openai', model: 'gpt-5' },
  { agentId: 'calculation', label: 'Cálculo', connectionId: 'connection-openai', model: 'gpt-5-mini' },
  { agentId: 'writer', label: 'Escritor', connectionId: null, model: '' },
  { agentId: 'curator', label: 'Curador', connectionId: null, model: '' },
]
