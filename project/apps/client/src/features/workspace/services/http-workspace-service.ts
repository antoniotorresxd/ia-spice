import type {
  ProjectInput,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceProject,
  WorkspaceProjectDetail,
  WorkspaceSnapshot,
} from '../model/workspace-types'
import type { WorkspaceService } from './workspace-service'

type Options = { fetchImpl?: typeof fetch }

export function createHttpWorkspaceService(options: Options = {}): WorkspaceService {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const fetchImpl = options.fetchImpl ?? fetch
    const response = await fetchImpl(path, {
      credentials: 'include',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      ...init,
    })
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path} respondió ${response.status}`)
    }
    return (await response.json()) as T
  }

  // assignConversation y restoreConversationProject son la misma operación:
  // mover la conversación a un proyecto o a ninguno.
  function move(conversationId: string, projectId: string | null) {
    return request<WorkspaceConversation>(
      `/api/workspace/conversations/${conversationId}/project`,
      { method: 'PATCH', body: JSON.stringify({ projectId }) },
    )
  }

  return {
    async getSnapshot(): Promise<WorkspaceSnapshot> {
      return request<WorkspaceSnapshot>('/api/workspace/snapshot')
    },

    async getProject(projectId): Promise<WorkspaceProjectDetail> {
      return request<WorkspaceProjectDetail>(`/api/workspace/projects/${projectId}`)
    },

    async getConversation(conversationId): Promise<WorkspaceConversationDetail> {
      return request<WorkspaceConversationDetail>(
        `/api/workspace/conversations/${conversationId}`,
      )
    },

    async createProject(input: ProjectInput): Promise<WorkspaceProject> {
      return request<WorkspaceProject>('/api/workspace/projects', {
        method: 'POST',
        body: JSON.stringify({ name: input.name.trim(), description: input.description.trim() }),
      })
    },

    async submitRequest(text): Promise<WorkspaceConversationDetail> {
      return request<WorkspaceConversationDetail>('/api/workspace/conversations', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      })
    },

    async continueConversation(conversationId, text): Promise<WorkspaceConversationDetail> {
      return request<WorkspaceConversationDetail>(
        `/api/workspace/conversations/${conversationId}/messages`,
        { method: 'POST', body: JSON.stringify({ text: text.trim() }) },
      )
    },

    async assignConversation(conversationId, projectId): Promise<WorkspaceConversation> {
      return move(conversationId, projectId)
    },

    async restoreConversationProject(conversationId, projectId): Promise<WorkspaceConversation> {
      return move(conversationId, projectId)
    },
  }
}

export const httpWorkspaceService = createHttpWorkspaceService()
