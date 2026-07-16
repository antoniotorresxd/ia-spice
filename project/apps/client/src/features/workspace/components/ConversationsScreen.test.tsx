import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { createMockWorkspaceService } from '../services/mock-workspace-service'
import { ConversationsScreen } from './ConversationsScreen'

afterEach(cleanup)

describe('ConversationsScreen', () => {
  it('filters conversations by normalized text, project, and execution state', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ConversationsScreen service={createMockWorkspaceService()} /></MemoryRouter>)

    expect(await screen.findByRole('row', { name: /Filtro RC pasa bajas/ })).toHaveTextContent('Filtros analógicos')

    await user.type(screen.getByLabelText('Buscar conversaciones'), 'polarizacion')
    expect(screen.getByRole('row', { name: /Polarización de transistor BJT/ })).toBeVisible()
    expect(screen.queryByRole('row', { name: /Filtro RC pasa bajas/ })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Buscar conversaciones'))
    await user.selectOptions(screen.getByLabelText('Proyecto'), 'unassigned')
    expect(screen.getByRole('row', { name: /Divisor de voltaje/ })).toBeVisible()

    await user.selectOptions(screen.getByLabelText('Proyecto'), 'all')
    await user.selectOptions(screen.getByLabelText('Estado'), 'failed')
    expect(screen.getByRole('row', { name: /Polarización de transistor BJT/ })).toBeVisible()
  })
})
