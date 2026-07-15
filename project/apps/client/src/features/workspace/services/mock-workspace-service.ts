import {
  workspaceConversationFixtures,
  workspaceProjectFixtures,
} from '../model/workspace-fixtures'
import type {
  ProjectInput,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceProject,
} from '../model/workspace-types'
import type { WorkspaceService } from './workspace-service'

const clone = <T>(value: T): T => structuredClone(value)
const summary = (conversation: WorkspaceConversationDetail): WorkspaceConversation => {
  const { messages: _messages, files: _files, execution: _execution, ...result } = conversation
  return result
}

export function createMockWorkspaceService(): WorkspaceService {
  const projects = clone(workspaceProjectFixtures)
  const conversations = clone(workspaceConversationFixtures)
  let projectSequence = 1
  let conversationSequence = 1

  const getProjectRecord = (projectId: string): WorkspaceProject => {
    const project = projects.find(({ id }) => id === projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return project
  }

  const getConversationRecord = (conversationId: string): WorkspaceConversationDetail => {
    const conversation = conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`)
    return conversation
  }

  const moveConversation = (conversationId: string, projectId: string | null) => {
    const conversation = getConversationRecord(conversationId)
    if (projectId !== null) getProjectRecord(projectId)
    projects.forEach((project) => {
      project.conversationIds = project.conversationIds.filter((id) => id !== conversationId)
    })
    if (projectId !== null) getProjectRecord(projectId).conversationIds.push(conversationId)
    conversation.projectId = projectId
    return clone(summary(conversation))
  }

  return {
    async getSnapshot() {
      return clone({
        projects,
        conversations: conversations.map(summary),
        unassignedConversationIds: conversations
          .filter(({ projectId }) => projectId === null)
          .map(({ id }) => id),
      })
    },
    async getProject(projectId) {
      const project = getProjectRecord(projectId)
      return clone({
        ...project,
        conversations: project.conversationIds.map((id) => summary(getConversationRecord(id))),
      })
    },
    async getConversation(conversationId) {
      return clone(getConversationRecord(conversationId))
    },
    async createProject(input: ProjectInput) {
      const project: WorkspaceProject = {
        id: `project-created-${projectSequence++}`,
        name: input.name,
        description: input.description,
        conversationIds: [],
        updatedAt: '2026-07-15T12:00:00.000Z',
      }
      projects.push(project)
      return clone(project)
    },
    async submitRequest(text) {
      const id = `conversation-created-${conversationSequence++}`
      const created: WorkspaceConversationDetail = {
        id,
        projectId: null,
        title: text,
        preview: text,
        updatedAt: '2026-07-15T12:00:00.000Z',
        executionStatus: 'active',
        messages: [
          { id: `${id}-message-1`, role: 'user', content: text, createdAt: '2026-07-15T12:00:00.000Z' },
          { id: `${id}-message-2`, role: 'assistant', content: 'Estoy preparando el circuito.', createdAt: '2026-07-15T12:00:01.000Z' },
        ],
        files: [],
        execution: { id: `${id}-execution`, status: 'active', summary: 'Diseño en progreso' },
      }
      conversations.push(created)
      return clone(created)
    },
    async continueConversation(conversationId, text) {
      const conversation = getConversationRecord(conversationId)
      const next = conversation.messages.length + 1
      conversation.messages.push(
        { id: `${conversationId}-message-${next}`, role: 'user', content: text, createdAt: '2026-07-15T12:01:00.000Z' },
        { id: `${conversationId}-message-${next + 1}`, role: 'assistant', content: 'Incorporé la nueva indicación.', createdAt: '2026-07-15T12:01:01.000Z' },
      )
      conversation.preview = text
      conversation.updatedAt = '2026-07-15T12:01:01.000Z'
      return clone(conversation)
    },
    async assignConversation(conversationId, projectId) {
      return moveConversation(conversationId, projectId)
    },
    async restoreConversationProject(conversationId, projectId) {
      return moveConversation(conversationId, projectId)
    },
  }
}
