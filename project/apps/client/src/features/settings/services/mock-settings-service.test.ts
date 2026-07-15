import { describe, expect, it } from 'vitest'

import { createMockSettingsService } from './mock-settings-service'

describe('MockSettingsService', () => {
  it('never returns a full key after creating a connection', async () => {
    const service = createMockSettingsService()
    const created = await service.createConnection({ label: 'Claude personal', provider: 'anthropic', apiKey: 'sk-ant-secret-1234', baseUrl: '' })

    expect(created).toMatchObject({ hasKey: true, keyHint: '1234' })
    expect(JSON.stringify(created)).not.toContain('sk-ant-secret-1234')
  })

  it('preserves the key metadata when an edit has an empty key', async () => {
    const service = createMockSettingsService()
    const updated = await service.updateConnection('connection-openai', { label: 'OpenAI renamed', provider: 'openai', apiKey: '', baseUrl: '' })

    expect(updated).toMatchObject({ hasKey: true, keyHint: '7890' })
  })

  it('reuses one connection with different models', async () => {
    const service = createMockSettingsService()
    await service.updateAgentAssignment('orchestrator', { connectionId: 'connection-openai', model: 'gpt-5' })
    await service.updateAgentAssignment('curator', { connectionId: 'connection-openai', model: 'gpt-5-mini' })
    const assignments = await service.listAgentAssignments()

    expect(assignments.find((item) => item.agentId === 'orchestrator')?.model).toBe('gpt-5')
    expect(assignments.find((item) => item.agentId === 'curator')?.model).toBe('gpt-5-mini')
  })

  it('lists exactly the four configurable agent labels without Shell', async () => {
    const service = createMockSettingsService()

    expect((await service.listAgentAssignments()).map((item) => item.label)).toEqual([
      'Orquestador',
      'Cálculo',
      'Escritura',
      'Curador',
    ])
  })

  it('clears matching assignments when deleting a connection', async () => {
    const service = createMockSettingsService()
    await service.deleteConnection('connection-openai')

    expect((await service.listAgentAssignments()).filter((item) => item.connectionId === 'connection-openai')).toEqual([])
  })

  it('isolates fixture state between service instances and returned values', async () => {
    const first = createMockSettingsService()
    const second = createMockSettingsService()
    const connections = await first.listConnections()
    connections[0].label = 'mutated externally'
    await first.deleteConnection('connection-openai')

    expect((await first.listConnections())[0]?.label).not.toBe('mutated externally')
    expect((await second.listConnections()).some((item) => item.id === 'connection-openai')).toBe(true)
  })
})
