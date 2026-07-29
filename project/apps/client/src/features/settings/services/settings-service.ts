import type {
  AgentAssignment,
  AgentAssignmentInput,
  AgentId,
  ConnectionInput,
  ConnectionTestResult,
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
  testConnection(id: string): Promise<ConnectionTestResult>
  listAgentAssignments(): Promise<AgentAssignment[]>
  updateAgentAssignment(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}
