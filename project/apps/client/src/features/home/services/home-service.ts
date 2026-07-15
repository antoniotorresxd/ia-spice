import type {
  ConversationExecution,
  ConversationSummary,
  HomeOverviewData,
  PromptInput,
  UsagePeriod,
} from '../model/home-types'

export type HomeService = {
  getHomeOverview(period: UsagePeriod): Promise<HomeOverviewData>
  getRecentActivity(): Promise<ConversationExecution[]>
  submitPrompt(input: PromptInput): Promise<ConversationExecution>
  assignConversationToProject(
    conversationId: string,
    projectId: string,
  ): Promise<ConversationSummary>
}

