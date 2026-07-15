import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsService } from '../services/settings-service'
import { ProfileSettingsScreen } from './ProfileSettingsScreen'

const profile = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  avatarUrl: null,
}

function makeService(
  overrides: Partial<SettingsService> = {},
): SettingsService {
  return {
    getProfile: vi.fn().mockResolvedValue(profile),
    updateProfile: vi.fn().mockImplementation(async (input) => ({
      ...profile,
      ...input,
    })),
    listConnections: vi.fn(),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    deleteConnection: vi.fn(),
    listAgentAssignments: vi.fn(),
    updateAgentAssignment: vi.fn(),
    ...overrides,
  }
}

describe('ProfileSettingsScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:avatar-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads the profile and keeps the email read-only', async () => {
    render(<ProfileSettingsScreen service={makeService()} />)

    expect(await screen.findByDisplayValue('Ada Lovelace')).toBeVisible()
    expect(screen.getByLabelText('Correo electrónico')).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Tu perfil' })).toBeVisible()
  })

  it('rejects an empty name', async () => {
    const user = userEvent.setup()
    render(<ProfileSettingsScreen service={makeService()} />)
    await screen.findByDisplayValue('Ada Lovelace')

    await user.clear(screen.getByLabelText('Nombre'))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu nombre.')
  })

  it('saves a trimmed name and announces success', async () => {
    const service = makeService()
    const user = userEvent.setup()
    render(<ProfileSettingsScreen service={service} />)
    await screen.findByDisplayValue('Ada Lovelace')

    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), '  Grace Hopper  ')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(service.updateProfile).toHaveBeenCalledWith({
        name: 'Grace Hopper',
        avatarUrl: null,
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tus cambios se guardaron.',
    )
  })

  it('restores saved values when changes are discarded', async () => {
    const user = userEvent.setup()
    render(<ProfileSettingsScreen service={makeService()} />)
    await screen.findByDisplayValue('Ada Lovelace')

    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Grace Hopper')
    await user.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ada Lovelace')
  })

  it('shows a safe error when saving fails', async () => {
    const user = userEvent.setup()
    const service = makeService({
      updateProfile: vi.fn().mockRejectedValue(new Error('secret response')),
    })
    render(<ProfileSettingsScreen service={service} />)
    await screen.findByDisplayValue('Ada Lovelace')

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar tus cambios. Inténtalo de nuevo.',
    )
    expect(screen.queryByText('secret response')).not.toBeInTheDocument()
  })

  it('creates an avatar preview and revokes object URLs on replacement and unmount', async () => {
    const createObjectURL = vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
    const user = userEvent.setup()
    const { unmount } = render(<ProfileSettingsScreen service={makeService()} />)
    await screen.findByDisplayValue('Ada Lovelace')
    const input = screen.getByLabelText('Cambiar avatar')

    await user.upload(input, new File(['first'], 'first.png', { type: 'image/png' }))
    expect(screen.getByRole('img', { name: 'Vista previa del avatar' })).toHaveAttribute(
      'src',
      'blob:first',
    )
    await user.upload(input, new File(['second'], 'second.png', { type: 'image/png' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first')

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second')
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })
})
