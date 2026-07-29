import { authClient } from '../../auth/services/auth-client'
import {
  AGENT_LABELS,
  AGENT_ORDER,
  type AgentAssignment,
  type AgentAssignmentInput,
  type AgentId,
  type ConnectionInput,
  type ConnectionTestResult,
  type LlmConnection,
  type UserProfile,
} from '../model/settings-types'
import type { SettingsService } from './settings-service'

type Options = { fetchImpl?: typeof fetch }

// El server valida apiKey con .min(1) y baseUrl con z.url(); mandar '' sería
// un 400. El formulario usa cadenas vacías para "sin valor".
function omitEmpty(input: ConnectionInput): Record<string, string> {
  const body: Record<string, string> = {
    label: input.label.trim(),
    provider: input.provider,
  }
  const apiKey = input.apiKey.trim()
  const baseUrl = input.baseUrl.trim()
  if (apiKey) body.apiKey = apiKey
  if (baseUrl) body.baseUrl = baseUrl
  return body
}

export function createHttpSettingsService(options: Options = {}): SettingsService {
  const fetchImpl = options.fetchImpl ?? fetch

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(path, {
      credentials: 'include',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      ...init,
    })
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path} respondió ${response.status}`)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    async getProfile(): Promise<UserProfile> {
      const { data } = await authClient.getSession()
      return {
        name: data?.user.name ?? '',
        email: data?.user.email ?? '',
        avatarUrl: data?.user.image ?? null,
      }
    },

    async updateProfile(input) {
      await authClient.updateUser({ name: input.name.trim(), image: input.avatarUrl })
      return {
        name: input.name.trim(),
        email: (await authClient.getSession()).data?.user.email ?? '',
        avatarUrl: input.avatarUrl,
      }
    },

    async listConnections() {
      return request<LlmConnection[]>('/api/llm/connections')
    },

    async createConnection(input) {
      return request<LlmConnection>('/api/llm/connections', {
        method: 'POST',
        body: JSON.stringify(omitEmpty(input)),
      })
    },

    async updateConnection(id, input) {
      // provider no es actualizable: cambiarlo invalidaría la credencial guardada
      const { provider: _provider, ...body } = omitEmpty(input)
      return request<LlmConnection>(`/api/llm/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },

    async deleteConnection(id) {
      await request<{ deleted: string }>(`/api/llm/connections/${id}`, { method: 'DELETE' })
    },

    async testConnection(id): Promise<ConnectionTestResult> {
      return request<ConnectionTestResult>(`/api/llm/connections/${id}/test`, {
        method: 'POST',
      })
    },

    async listAgentAssignments(): Promise<AgentAssignment[]> {
      const rows = await request<
        { agentId: AgentId; connectionId: string | null; model: string }[]
      >('/api/llm/assignments')
      const byAgent = new Map(rows.map((row) => [row.agentId, row]))
      return AGENT_ORDER.map((agentId) => {
        const row = byAgent.get(agentId)
        return {
          agentId,
          label: AGENT_LABELS[agentId],
          connectionId: row?.connectionId ?? null,
          model: row?.model ?? '',
        }
      })
    },

    async updateAgentAssignment(agentId: AgentId, input: AgentAssignmentInput) {
      const row = await request<{ agentId: AgentId; connectionId: string | null; model: string }>(
        `/api/llm/assignments/${agentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ connectionId: input.connectionId, model: input.model }),
        },
      )
      return { ...row, label: AGENT_LABELS[agentId] }
    },
  }
}

export const httpSettingsService = createHttpSettingsService()
