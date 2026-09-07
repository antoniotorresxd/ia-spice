import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockWorkspaceService } from '../services/mock-workspace-service'
import { FilesScreen } from './FilesScreen'

afterEach(cleanup)

describe('FilesScreen', () => {
  it('renders files list with stats cards and filters by text', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()

    vi.spyOn(service, 'getFiles').mockResolvedValue([
      {
        id: 'file-1',
        conversationId: 'conv-1',
        name: 'circuit.cir',
        language: 'spice',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Filtro RC',
        projectId: 'project-filters',
      },
      {
        id: 'file-2',
        conversationId: 'conv-2',
        name: 'report.pdf',
        language: 'pdf',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Análisis BJT',
        projectId: null,
      },
    ])

    render(
      <MemoryRouter>
        <FilesScreen service={service} />
      </MemoryRouter>,
    )

    // Heading and stats
    expect(await screen.findByRole('heading', { name: 'Archivos y Artefactos', level: 1 })).toBeVisible()
    expect(screen.getByText('Total de Archivos')).toBeVisible()

    // Table rows
    expect(await screen.findByRole('row', { name: /circuit\.cir/ })).toBeVisible()
    expect(screen.getByRole('row', { name: /report\.pdf/ })).toBeVisible()

    // Search filter
    await user.type(screen.getByLabelText('Buscar archivos'), 'circuit')
    expect(screen.getByRole('row', { name: /circuit\.cir/ })).toBeVisible()
    expect(screen.queryByRole('row', { name: /report\.pdf/ })).not.toBeInTheDocument()
  })

  it('filters by file type and project', async () => {
    const user = userEvent.setup()
    const service = createMockWorkspaceService()

    vi.spyOn(service, 'getFiles').mockResolvedValue([
      {
        id: 'file-1',
        conversationId: 'conv-1',
        name: 'circuit.cir',
        language: 'spice',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Filtro RC',
        projectId: 'project-filters',
      },
      {
        id: 'file-2',
        conversationId: 'conv-2',
        name: 'report.pdf',
        language: 'pdf',
        status: 'complete',
        createdAt: '2026-07-15T12:00:00.000Z',
        conversationTitle: 'Análisis BJT',
        projectId: null,
      },
    ])

    render(
      <MemoryRouter>
        <FilesScreen service={service} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('row', { name: /circuit\.cir/ })).toBeVisible()

    // Filter by type: Reporte PDF
    await user.selectOptions(screen.getByLabelText('Tipo de archivo'), 'pdf')
    expect(screen.getByRole('row', { name: /report\.pdf/ })).toBeVisible()
    expect(screen.queryByRole('row', { name: /circuit\.cir/ })).not.toBeInTheDocument()

    // Reset type and filter by project: Sin proyecto
    await user.selectOptions(screen.getByLabelText('Tipo de archivo'), 'all')
    await user.selectOptions(screen.getByLabelText('Proyecto'), 'unassigned')
    expect(screen.getByRole('row', { name: /report\.pdf/ })).toBeVisible()
    expect(screen.queryByRole('row', { name: /circuit\.cir/ })).not.toBeInTheDocument()
  })
})
