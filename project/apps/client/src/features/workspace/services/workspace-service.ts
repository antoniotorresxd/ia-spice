import type {
  ProjectInput,
  TraceResponse,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceFileItem,
  WorkspaceProject,
  WorkspaceProjectDetail,
  WorkspaceSnapshot,
} from '../model/workspace-types'

export type ConversationEvent = {
  type: 'stage' | 'done' | 'error'
  data: unknown
}

export type WorkspaceService = {
  getSnapshot(): Promise<WorkspaceSnapshot>
  getProject(projectId: string): Promise<WorkspaceProjectDetail>
  getConversation(
    conversationId: string,
    options?: { bypassCache?: boolean },
  ): Promise<WorkspaceConversationDetail>
  createProject(input: ProjectInput): Promise<WorkspaceProject>
  updateProject(projectId: string, input: ProjectInput): Promise<WorkspaceProjectDetail>
  submitRequest(text: string): Promise<WorkspaceConversationDetail>
  continueConversation(conversationId: string, text: string): Promise<WorkspaceConversationDetail>
  renameConversation(conversationId: string, title: string): Promise<WorkspaceConversationDetail>
  assignConversation(conversationId: string, projectId: string): Promise<WorkspaceConversation>
  restoreConversationProject(conversationId: string, projectId: string | null): Promise<WorkspaceConversation>
  deleteProject(projectId: string): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  getFiles(): Promise<WorkspaceFileItem[]>
  getTrace?(conversationId: string): Promise<TraceResponse>
  subscribeConversationEvents?(
    conversationId: string,
    listener: (event: ConversationEvent) => void,
  ): () => void
}

