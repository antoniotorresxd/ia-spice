import { API_BASE_URL } from '../../../lib/api-base'
import type {
  ConversationExecution,
  ConversationSummary,
  HomeOverviewData,
  PromptInput,
  UsagePeriod,
} from '../model/home-types'
import {
  activeDraftExecutionFixture,
  draftConversationFixture,
  homeOverviewFixture,
  usageByPeriod,
} from '../model/home-fixtures'
import type { HomeService } from './home-service'

type Options = {
  fetchImpl?: typeof fetch
}

export function createHttpHomeService(options: Options = {}): HomeService {
  const fetchImpl = options.fetchImpl ?? fetch

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  return {
    async getHomeOverview(period: UsagePeriod): Promise<HomeOverviewData> {
      try {
        const metrics = await request<any>(`/api/workspace/dashboard?period=${period}`)
        // Si no hay ejecuciones registradas en la DB (total 0),
        // mantenemos datos ilustrativos o mostramos las métricas en 0 con isDemo=true
        if (metrics.executions === 0) {
          return {
            ...homeOverviewFixture,
            usage: {
              ...metrics,
              tokens: { used: 0, limit: 100_000 },
              estimatedCostUsd: 0,
            },
            isDemo: true,
          }
        }

        return {
          ...homeOverviewFixture,
          usage: metrics,
          isDemo: false,
        }
      } catch (err) {
        console.warn('Error fetching dashboard metrics from API, falling back to mock fixtures:', err)
        return {
          ...homeOverviewFixture,
          usage: usageByPeriod[period],
          isDemo: true,
        }
      }
    },

    async getRecentActivity(): Promise<ConversationExecution[]> {
      return structuredClone(homeOverviewFixture.recentExecutions)
    },

    async submitPrompt({ text }: PromptInput): Promise<ConversationExecution> {
      if (!text.trim()) {
        throw new Error('Prompt text is required')
      }
      return structuredClone(activeDraftExecutionFixture)
    },

    async assignConversationToProject(
      _conversationId: string,
      projectId: string,
    ): Promise<ConversationSummary> {
      return {
        ...structuredClone(draftConversationFixture),
        projectId,
        isTemporary: false,
      }
    },
  }
}

export const httpHomeService = createHttpHomeService()
