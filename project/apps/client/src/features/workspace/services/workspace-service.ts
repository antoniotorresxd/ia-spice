import type {
  ProjectInput,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceProject,
  WorkspaceProjectDetail,
  WorkspaceSnapshot,
} from '../model/workspace-types'

export type WorkspaceService = {
  getSnapshot(): Promise<WorkspaceSnapshot>
  getProject(projectId: string): Promise<WorkspaceProjectDetail>
  getConversation(conversationId: string): Promise<WorkspaceConversationDetail>
  createProject(input: ProjectInput): Promise<WorkspaceProject>
  submitRequest(text: string): Promise<WorkspaceConversationDetail>
  continueConversation(conversationId: string, text: string): Promise<WorkspaceConversationDetail>
  assignConversation(conversationId: string, projectId: string): Promise<WorkspaceConversation>
  restoreConversationProject(conversationId: string, projectId: string | null): Promise<WorkspaceConversation>
}
