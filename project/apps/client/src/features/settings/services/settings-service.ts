import type {
  AgentAssignment,
  AgentAssignmentInput,
  AgentId,
  ConnectionInput,
  LlmConnection,
  UserProfile,
} from '../model/settings-types'

export type SettingsService = {
  getProfile(): Promise<UserProfile>
  updateProfile(input: Pick<UserProfile, 'name' | 'avatarUrl'>): Promise<UserProfile>
  listConnections(): Promise<LlmConnection[]>
  createConnection(input: ConnectionInput): Promise<LlmConnection>
  updateConnection(id: string, input: ConnectionInput): Promise<LlmConnection>
  deleteConnection(id: string): Promise<void>
  listAgentAssignments(): Promise<AgentAssignment[]>
  updateAgentAssignment(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}
