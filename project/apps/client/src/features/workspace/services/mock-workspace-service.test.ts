import { describe, expect, it } from 'vitest'

import { createMockWorkspaceService } from './mock-workspace-service'

describe('createMockWorkspaceService', () => {
  it('creates new requests without a project', async () => {
    const service = createMockWorkspaceService()
    const created = await service.submitRequest('Diseña un filtro RC')

    expect(created.projectId).toBeNull()
    expect((await service.getSnapshot()).unassignedConversationIds).toContain(created.id)
  })

  it('assigns and restores a conversation project', async () => {
    const service = createMockWorkspaceService()
    const conversation = await service.submitRequest('Diseña un filtro RC')
    const moved = await service.assignConversation(conversation.id, 'project-filters')

    expect(moved.projectId).toBe('project-filters')
    const restored = await service.restoreConversationProject(conversation.id, null)
    expect(restored.projectId).toBeNull()
  })

  it('keeps file counts synchronized when moving conversations', async () => {
    const service = createMockWorkspaceService()

    await service.assignConversation('conversation-rc', 'project-amplifiers')
    expect(await service.getProject('project-filters')).toMatchObject({
      conversationIds: ['conversation-active-filter'],
      fileCount: 1,
    })
    expect(await service.getProject('project-amplifiers')).toMatchObject({
      conversationIds: ['conversation-opamp', 'conversation-bjt', 'conversation-rc'],
      fileCount: 3,
    })

    await service.restoreConversationProject('conversation-rc', null)
    expect(await service.getProject('project-amplifiers')).toMatchObject({
      conversationIds: ['conversation-opamp', 'conversation-bjt'],
      fileCount: 2,
    })
  })

  it('does not drift counts or identifiers on repeated assignment', async () => {
    const service = createMockWorkspaceService()
    const conversationId = 'conversation-rc'

    await service.assignConversation(conversationId, 'project-filters')
    await service.assignConversation(conversationId, 'project-filters')
    const assigned = await service.getProject('project-filters')
    expect(assigned.fileCount).toBe(2)
    expect(assigned.conversationIds.filter((id) => id === conversationId)).toHaveLength(1)

    await service.restoreConversationProject(conversationId, null)
    await service.restoreConversationProject(conversationId, null)
    expect(await service.getProject('project-filters')).toMatchObject({ fileCount: 1 })

    await service.assignConversation(conversationId, 'project-filters')
    await service.assignConversation(conversationId, 'project-filters')
    expect(await service.getProject('project-filters')).toMatchObject({ fileCount: 2 })
  })

  it('looks up fixture projects and conversations', async () => {
    const service = createMockWorkspaceService()

    const project = await service.getProject('project-filters')
    expect(project.conversations.length).toBeGreaterThan(0)
    expect(project.fileCount).toBe(2)
    expect(await service.getConversation(project.conversationIds[0])).toMatchObject({
      projectId: project.id,
    })
  })

  it('creates projects and includes them in subsequent snapshots', async () => {
    const service = createMockWorkspaceService()
    const project = await service.createProject({
      name: 'Fuentes conmutadas',
      description: 'Convertidores DC-DC',
    })

    expect(project).toMatchObject({ name: 'Fuentes conmutadas', conversationIds: [], fileCount: 0 })
    expect((await service.getSnapshot()).projects).toContainEqual(project)
  })

  it('continues a conversation while preserving its history', async () => {
    const service = createMockWorkspaceService()
    const initial = await service.submitRequest('Diseña un filtro RC')
    const continued = await service.continueConversation(initial.id, 'Usa 1 kHz')

    expect(continued.messages).toHaveLength(initial.messages.length + 2)
    expect(continued.messages.at(-2)?.content).toBe('Usa 1 kHz')
  })

  it('rejects missing identifiers', async () => {
    const service = createMockWorkspaceService()

    await expect(service.getProject('missing')).rejects.toThrow('Project not found: missing')
    await expect(service.getConversation('missing')).rejects.toThrow(
      'Conversation not found: missing',
    )
    await expect(service.assignConversation('missing', 'project-filters')).rejects.toThrow(
      'Conversation not found: missing',
    )
    await expect(service.assignConversation('conversation-unassigned', 'missing')).rejects.toThrow(
      'Project not found: missing',
    )
  })

  it('keeps service instances independent', async () => {
    const first = createMockWorkspaceService()
    const second = createMockWorkspaceService()
    const created = await first.submitRequest('Solo existe en la primera instancia')

    await expect(second.getConversation(created.id)).rejects.toThrow()
    expect((await second.getSnapshot()).unassignedConversationIds).not.toContain(created.id)
  })

  it('completa la ejecución de una solicitud nueva en la siguiente lectura', async () => {
    const service = createMockWorkspaceService()

    const created = await service.submitRequest('un divisor de 12V a 5V')
    expect(created.executionStatus).toBe('active')

    const polled = await service.getConversation(created.id)
    expect(polled.executionStatus).toBe('completed')
    expect(polled.execution.status).toBe('completed')
    expect(polled.files).toHaveLength(1)
    expect(polled.files[0].language).toBe('spice')
    expect(polled.messages.at(-1)?.role).toBe('assistant')
  })

  it('no reabre ni vuelve a completar una conversación ya completada', async () => {
    const service = createMockWorkspaceService()

    const created = await service.submitRequest('un divisor de 12V a 5V')
    const first = await service.getConversation(created.id)
    const second = await service.getConversation(created.id)

    expect(second.executionStatus).toBe('completed')
    expect(second.messages).toHaveLength(first.messages.length)
    expect(second.files).toHaveLength(1)
  })

  it('no toca las conversaciones de fixture que ya vienen activas', async () => {
    const service = createMockWorkspaceService()
    const snapshot = await service.getSnapshot()
    const active = snapshot.conversations.find((item) => item.executionStatus === 'active')

    if (active) {
      const detail = await service.getConversation(active.id)
      expect(detail.executionStatus).toBe('active')
    }
  })
})
