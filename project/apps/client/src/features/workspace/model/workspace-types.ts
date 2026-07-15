export type WorkspaceExecutionStatus = 'active' | 'completed' | 'failed'

export type WorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type WorkspaceExecution = {
  id: string
  status: WorkspaceExecutionStatus
  summary: string
}

export type WorkspaceFile = {
  id: string
  name: string
  language: string
  content: string
  status: 'complete' | 'partial'
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
