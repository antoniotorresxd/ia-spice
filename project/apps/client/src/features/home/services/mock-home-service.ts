import {
  activeDraftExecutionFixture,
  draftConversationFixture,
  homeOverviewFixture,
  usageByPeriod,
} from '../model/home-fixtures'
import type { HomeService } from './home-service'

export function createMockHomeService(): HomeService {
  return {
    async getHomeOverview(period) {
      return structuredClone({
        ...homeOverviewFixture,
        usage: usageByPeriod[period],
      })
    },
    async getRecentActivity() {
      return structuredClone(homeOverviewFixture.recentExecutions)
    },
    async submitPrompt({ text }) {
      if (!text.trim()) {
        throw new Error('Prompt text is required')
      }

      return structuredClone(activeDraftExecutionFixture)
    },
    async assignConversationToProject(_conversationId, projectId) {
      return {
        ...structuredClone(draftConversationFixture),
        projectId,
        isTemporary: false,
      }
    },
  }
}

export const mockHomeService = createMockHomeService()
