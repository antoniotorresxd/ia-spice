import { describe, expect, it, vi } from 'vitest'

import { createHttpSettingsService } from './http-settings-service'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const connectionRow = {
  id: 'conn-1',
  label: 'OpenAI',
  provider: 'openai',
  baseUrl: null,
  hasKey: true,
  keyHint: '7890',
  lastTestStatus: null,
  lastTestedAt: null,
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
}

describe('createHttpSettingsService', () => {
  it('lista las conexiones desde el server', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([connectionRow]))
    const service = createHttpSettingsService({ fetchImpl })

    const result = await service.listConnections()

    expect(result).toEqual([connectionRow])
    expect(fetchImpl.mock.calls[0][0]).toContain('/api/llm/connections')
  })

  it('omite apiKey y baseUrl vacíos al crear, porque el server los rechaza', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(connectionRow, 201))
    const service = createHttpSettingsService({ fetchImpl })

    await service.createConnection({
      label: 'OpenAI',
      provider: 'openai',
      apiKey: 'sk-1234',
      baseUrl: '',
    })

    const body = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)
    expect(body).toEqual({ label: 'OpenAI', provider: 'openai', apiKey: 'sk-1234' })
    expect('baseUrl' in body).toBe(false)
  })

  it('omite la apiKey vacía al actualizar, para no borrar la existente', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(connectionRow))
    const service = createHttpSettingsService({ fetchImpl })

    await service.updateConnection('conn-1', {
      label: 'Renombrada',
      provider: 'openai',
      apiKey: '',
      baseUrl: '',
    })

    const body = JSON.parse(fetchImpl.mock.calls[0][1]!.body as string)
    expect(body).toEqual({ label: 'Renombrada' })
  })

  it('devuelve el resultado de la prueba tal cual', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ ok: false, error: 'El proveedor rechazó la credencial.' }))
    const service = createHttpSettingsService({ fetchImpl })

    const result = await service.testConnection('conn-1')

    expect(result).toEqual({ ok: false, error: 'El proveedor rechazó la credencial.' })
    expect(fetchImpl.mock.calls[0][0]).toContain('/api/llm/connections/conn-1/test')
  })

  it('completa las asignaciones con la etiqueta de la interfaz', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse([
        { agentId: 'orchestrator', connectionId: 'conn-1', model: 'gpt-5' },
        { agentId: 'calculation', connectionId: null, model: '' },
        { agentId: 'writer', connectionId: null, model: '' },
        { agentId: 'curator', connectionId: null, model: '' },
      ]),
    )
    const service = createHttpSettingsService({ fetchImpl })

    const result = await service.listAgentAssignments()

    expect(result[0]).toEqual({
      agentId: 'orchestrator',
      label: 'Orquestador',
      connectionId: 'conn-1',
      model: 'gpt-5',
    })
    expect(result.map((a) => a.label)).toEqual(['Orquestador', 'Cálculo', 'Escritura', 'Curador'])
  })

  it('lanza un error cuando el server responde con fallo', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'Not Found' }, 404))
    const service = createHttpSettingsService({ fetchImpl })

    await expect(service.deleteConnection('conn-x')).rejects.toThrow()
  })
})
