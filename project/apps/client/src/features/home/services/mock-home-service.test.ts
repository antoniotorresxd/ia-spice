import { describe, expect, it } from 'vitest'

import { createMockHomeService } from './mock-home-service'

describe('MockHomeService', () => {
  it('returns tokens as the primary usage metric for the selected period', async () => {
    const service = createMockHomeService()
    const overview = await service.getHomeOverview('30d')

    expect(overview.usage.period).toBe('30d')
    expect(overview.usage.tokens).toEqual({ used: 184_200, limit: 500_000 })
    expect(overview.usage.estimatedCostUsd).toBe(3.84)
  })

  it('creates an unassigned temporary conversation from a prompt', async () => {
    const service = createMockHomeService()
    const execution = await service.submitPrompt({
      text: 'Diseña un filtro RC de 1 kHz',
    })

    expect(execution.projectId).toBeNull()
    expect(execution.conversation.isTemporary).toBe(true)
    expect(execution.stages.map((stage) => stage.kind)).toEqual([
      'interpretation',
      'calculation',
      'simulation',
      'curation',
      'result',
    ])
  })

  it('assigns a temporary conversation to an existing project', async () => {
    const service = createMockHomeService()
    const assigned = await service.assignConversationToProject(
      'conversation-draft',
      'project-filter',
    )

    expect(assigned.projectId).toBe('project-filter')
    expect(assigned.isTemporary).toBe(false)
  })

  it('rejects an empty prompt', async () => {
    const service = createMockHomeService()

    await expect(service.submitPrompt({ text: '   ' })).rejects.toThrow(
      'Prompt text is required',
    )
  })
})
