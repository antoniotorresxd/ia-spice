import { API_BASE_URL } from '../../../lib/api-base'
import type {
  ProjectInput,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceProject,
  WorkspaceProjectDetail,
  WorkspaceSnapshot,
} from '../model/workspace-types'
import type { WorkspaceService } from './workspace-service'
import { QueryCache, globalQueryCache } from '@/lib/query-cache'

type Options = { fetchImpl?: typeof fetch; cache?: QueryCache }

export function createHttpWorkspaceService(options: Options = {}): WorkspaceService {
  const cache = options.cache ?? new QueryCache()

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const fetchImpl = options.fetchImpl ?? fetch
    const response = await fetchImpl(`${API_BASE_URL}${path}`, {
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
    cache.invalidate('workspace:snapshot')
    return request<WorkspaceConversation>(
      `/api/workspace/conversations/${conversationId}/project`,
      { method: 'PATCH', body: JSON.stringify({ projectId }) },
    )
  }

  return {
    async getSnapshot(): Promise<WorkspaceSnapshot> {
      return cache.fetch('workspace:snapshot', () => request<WorkspaceSnapshot>('/api/workspace/snapshot'), {
        ttlMs: 30_000,
      })
    },

    async getProject(projectId): Promise<WorkspaceProjectDetail> {
      return cache.fetch(`workspace:project:${projectId}`, () => request<WorkspaceProjectDetail>(`/api/workspace/projects/${projectId}`), {
        ttlMs: 30_000,
      })
    },

    async getConversation(conversationId, options): Promise<WorkspaceConversationDetail> {
      return cache.fetch(
        `workspace:conversation:${conversationId}`,
        () => request<WorkspaceConversationDetail>(`/api/workspace/conversations/${conversationId}`),
        { ttlMs: 10_000, bypassCache: options?.bypassCache },
      )
    },

    subscribeConversationEvents(conversationId, listener) {
      if (typeof EventSource === 'undefined') {
        return () => {}
      }
      const source = new EventSource(`${API_BASE_URL}/api/workspace/conversations/${conversationId}/events`, {
        withCredentials: true,
      })

      const handleStage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          listener({ type: 'stage', data })
        } catch {}
      }

      const handleDone = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          listener({ type: 'done', data })
        } catch {}
      }

      const handleError = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          listener({ type: 'error', data })
        } catch {}
      }

      source.addEventListener('stage', handleStage)
      source.addEventListener('done', handleDone)
      source.addEventListener('error', handleError)

      return () => {
        source.removeEventListener('stage', handleStage)
        source.removeEventListener('done', handleDone)
        source.removeEventListener('error', handleError)
        source.close()
      }
    },

    async createProject(input: ProjectInput): Promise<WorkspaceProject> {
      cache.invalidate('workspace:snapshot')
      return request<WorkspaceProject>('/api/workspace/projects', {
        method: 'POST',
        body: JSON.stringify({ name: input.name.trim(), description: input.description.trim() }),
      })
    },

    async updateProject(projectId, input): Promise<WorkspaceProjectDetail> {
      cache.invalidate('workspace:snapshot')
      cache.invalidate(`workspace:project:${projectId}`)
      return request<WorkspaceProjectDetail>(`/api/workspace/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name.trim(), description: input.description.trim() }),
      })
    },

    async submitRequest(text): Promise<WorkspaceConversationDetail> {
      cache.invalidate('workspace:snapshot')
      cache.invalidate('workspace:files')
      return request<WorkspaceConversationDetail>('/api/workspace/conversations', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      })
    },

    async continueConversation(conversationId, text): Promise<WorkspaceConversationDetail> {
      cache.invalidate(`workspace:conversation:${conversationId}`)
      cache.invalidate('workspace:files')
      return request<WorkspaceConversationDetail>(
        `/api/workspace/conversations/${conversationId}/messages`,
        { method: 'POST', body: JSON.stringify({ text: text.trim() }) },
      )
    },

    async renameConversation(conversationId, title): Promise<WorkspaceConversationDetail> {
      cache.invalidate('workspace:snapshot')
      cache.invalidate(`workspace:conversation:${conversationId}`)
      return request<WorkspaceConversationDetail>(
        `/api/workspace/conversations/${conversationId}`,
        { method: 'PATCH', body: JSON.stringify({ title: title.trim() }) },
      )
    },

    async assignConversation(conversationId, projectId): Promise<WorkspaceConversation> {
      return move(conversationId, projectId)
    },

    async restoreConversationProject(conversationId, projectId): Promise<WorkspaceConversation> {
      return move(conversationId, projectId)
    },

    async deleteProject(projectId): Promise<void> {
      cache.invalidate('workspace:snapshot')
      cache.invalidate(`workspace:project:${projectId}`)
      await request(`/api/workspace/projects/${projectId}`, { method: 'DELETE' })
    },

    async deleteConversation(conversationId): Promise<void> {
      cache.invalidate('workspace:snapshot')
      cache.invalidate(`workspace:conversation:${conversationId}`)
      cache.invalidate('workspace:files')
      await request(`/api/workspace/conversations/${conversationId}`, { method: 'DELETE' })
    },

    async getFiles() {
      return cache.fetch('workspace:files', () => request('/api/workspace/files'), {
        ttlMs: 30_000,
      })
    },
  }
}

export const httpWorkspaceService = createHttpWorkspaceService({ cache: globalQueryCache })
