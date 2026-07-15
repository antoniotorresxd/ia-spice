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
    expect(screen.getByText('Datos de demostración')).toBeVisible()
  })

  it('keeps load errors inside the shell and retries safely', async () => {
    const getProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error('private backend detail'))
      .mockResolvedValueOnce(profile)
    const user = userEvent.setup()
    render(<ProfileSettingsScreen service={makeService({ getProfile })} />)

    expect(screen.getByLabelText('Navegación principal')).toBeVisible()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar tu perfil. Inténtalo de nuevo.',
    )
    expect(screen.queryByText('private backend detail')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByDisplayValue('Ada Lovelace')).toBeVisible()
    expect(getProfile).toHaveBeenCalledTimes(2)
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

  it('saves a durable avatar that survives discard and remount', async () => {
    const user = userEvent.setup()
    let storedProfile = { ...profile }
    const service = makeService({
      getProfile: vi.fn(async () => storedProfile),
      updateProfile: vi.fn(async (input) => {
        storedProfile = { ...storedProfile, ...input }
        return storedProfile
      }),
    })
    const firstRender = render(<ProfileSettingsScreen service={service} />)
    await screen.findByDisplayValue('Ada Lovelace')

    await user.upload(
      screen.getByLabelText('Cambiar avatar'),
      new File(['avatar'], 'avatar.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByRole('status')
    const savedAvatar = screen.getByRole('img', {
      name: 'Vista previa del avatar',
    })
    expect(savedAvatar.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect(savedAvatar).not.toHaveAttribute('src', 'blob:avatar-preview')
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Grace Hopper')
    await user.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-preview')
    expect(screen.getByRole('img', { name: 'Vista previa del avatar' })).toHaveAttribute(
      'src',
      storedProfile.avatarUrl,
    )

    firstRender.unmount()
    render(<ProfileSettingsScreen service={service} />)
    expect(
      await screen.findByRole('img', { name: 'Vista previa del avatar' }),
    ).toHaveAttribute('src', storedProfile.avatarUrl)
  })

  it('persists data instead of the preview URL and still revokes the draft', async () => {
    const user = userEvent.setup()
    const service = makeService()
    const { unmount } = render(<ProfileSettingsScreen service={service} />)
    await screen.findByDisplayValue('Ada Lovelace')

    await user.upload(
      screen.getByLabelText('Cambiar avatar'),
      new File(['avatar'], 'avatar.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByRole('status')

    expect(service.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ada Lovelace',
        avatarUrl: expect.stringMatching(/^data:image\/png;base64,/),
      }),
    )
    expect(service.updateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: 'blob:avatar-preview' }),
    )
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-preview')
  })
})
