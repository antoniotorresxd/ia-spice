import { expect, it, vi } from 'vitest'

import { createHttpWorkspaceService } from './http-workspace-service'

const conversationDetail = {
  id: 'conv-1',
  projectId: null,
  title: 'un divisor de 12V a 5V',
  preview: 'all blocks within tolerance',
  updatedAt: '2026-07-29T12:00:05.000Z',
  executionStatus: 'completed',
  messages: [],
  files: [],
  execution: { id: 'exec-1', status: 'completed', summary: 'all blocks within tolerance' },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

it('lee el snapshot enviando las cookies de sesión', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    jsonResponse({ projects: [], conversations: [], unassignedConversationIds: [] }),
  )
  const service = createHttpWorkspaceService({ fetchImpl })

  const snapshot = await service.getSnapshot()

  expect(snapshot.projects).toEqual([])
  expect(fetchImpl).toHaveBeenCalledWith(
    '/api/workspace/snapshot',
    expect.objectContaining({ credentials: 'include' }),
  )
})

it('crea un proyecto con POST y el cuerpo en JSON', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    jsonResponse({
      id: 'p-1',
      name: 'Filtros',
      description: 'analógicos',
      conversationIds: [],
      fileCount: 0,
      updatedAt: '2026-07-29T12:00:00.000Z',
    }, 201),
  )
  const service = createHttpWorkspaceService({ fetchImpl })

  const project = await service.createProject({ name: 'Filtros', description: 'analógicos' })

  expect(project.id).toBe('p-1')
  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('/api/workspace/projects')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body)).toEqual({ name: 'Filtros', description: 'analógicos' })
})

it('envía una solicitud nueva al endpoint de conversaciones', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(conversationDetail, 201))
  const service = createHttpWorkspaceService({ fetchImpl })

  await service.submitRequest('un divisor de 12V a 5V')

  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('/api/workspace/conversations')
  expect(JSON.parse(init.body)).toEqual({ text: 'un divisor de 12V a 5V' })
})

it('continúa una conversación por su subruta de mensajes', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(conversationDetail))
  const service = createHttpWorkspaceService({ fetchImpl })

  await service.continueConversation('conv-1', 'ahora a 3.3V')

  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('/api/workspace/conversations/conv-1/messages')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body)).toEqual({ text: 'ahora a 3.3V' })
})

it('asignar y restaurar usan la misma ruta PATCH', async () => {
  const summary = {
    id: 'conv-1',
    projectId: 'p-1',
    title: 't',
    preview: 'p',
    updatedAt: '2026-07-29T12:00:05.000Z',
    executionStatus: 'completed',
  }
  const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(summary)))
  const service = createHttpWorkspaceService({ fetchImpl })

  await service.assignConversation('conv-1', 'p-1')
  await service.restoreConversationProject('conv-1', null)

  expect(fetchImpl.mock.calls[0][0]).toBe('/api/workspace/conversations/conv-1/project')
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ projectId: 'p-1' })
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/workspace/conversations/conv-1/project')
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ projectId: null })
})

it('un error del server se convierte en excepción con el código', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'Not Found' }, 404))
  const service = createHttpWorkspaceService({ fetchImpl })

  await expect(service.getConversation('conv-ausente')).rejects.toThrow('404')
})
