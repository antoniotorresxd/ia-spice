import {
  agentAssignmentsFixture,
  connectionsFixture,
  userProfileFixture,
} from '../model/settings-fixtures'
import type {
  AgentAssignmentInput,
  AgentId,
  LlmConnection,
} from '../model/settings-types'
import type { SettingsService } from './settings-service'

function keyMetadata(apiKey: string) {
  const key = apiKey.trim()
  return {
    hasKey: Boolean(key),
    keyHint: key ? key.slice(-4) : null,
  }
}

export function createMockSettingsService(): SettingsService {
  let profile = structuredClone(userProfileFixture)
  let connections = structuredClone(connectionsFixture)
  let assignments = structuredClone(agentAssignmentsFixture)
  let nextConnectionId = connections.length + 1

  return {
    async getProfile() {
      return structuredClone(profile)
    },
    async updateProfile(input) {
      profile = { ...profile, name: input.name.trim(), avatarUrl: input.avatarUrl }
      return structuredClone(profile)
    },
    async listConnections() {
      return structuredClone(connections)
    },
    async createConnection(input) {
      const now = new Date().toISOString()
      const connection: LlmConnection = {
        id: `connection-${nextConnectionId++}`,
        label: input.label.trim(),
        provider: input.provider,
        baseUrl: input.baseUrl.trim() || null,
        ...keyMetadata(input.apiKey),
        createdAt: now,
        updatedAt: now,
      }
      connections.push(connection)
      return structuredClone(connection)
    },
    async updateConnection(id, input) {
      const index = connections.findIndex((item) => item.id === id)
      if (index < 0) throw new Error(`Connection not found: ${id}`)

      const current = connections[index]
      const metadata = input.apiKey.trim()
        ? keyMetadata(input.apiKey)
        : { hasKey: current.hasKey, keyHint: current.keyHint }
      const updated: LlmConnection = {
        ...current,
        label: input.label.trim(),
        provider: input.provider,
        baseUrl: input.baseUrl.trim() || null,
        ...metadata,
        updatedAt: new Date().toISOString(),
      }
      connections[index] = updated
      return structuredClone(updated)
    },
    async deleteConnection(id) {
      connections = connections.filter((item) => item.id !== id)
      assignments = assignments.map((item) =>
        item.connectionId === id ? { ...item, connectionId: null } : item,
      )
    },
    async listAgentAssignments() {
      return structuredClone(assignments)
    },
    async updateAgentAssignment(agentId: AgentId, input: AgentAssignmentInput) {
      const index = assignments.findIndex((item) => item.agentId === agentId)
      if (index < 0) throw new Error(`Agent assignment not found: ${agentId}`)

      assignments[index] = { ...assignments[index], ...input }
      return structuredClone(assignments[index])
    },
  }
}

export const mockSettingsService = createMockSettingsService()
