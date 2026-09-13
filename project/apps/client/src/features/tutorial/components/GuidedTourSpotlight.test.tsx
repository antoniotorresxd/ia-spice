import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuidedTourSpotlight } from './GuidedTourSpotlight'
import type { TutorialConfig } from '../model/tutorial-content'

afterEach(cleanup)

describe('GuidedTourSpotlight', () => {
  const mockConfig: TutorialConfig = {
    pageKey: 'home',
    pageTitle: 'Inicio',
    subtitle: 'Guía',
    steps: [
      { id: '1', badge: 'Paso 1', title: 'Crear solicitudes', description: 'Haz clic aquí para crear más', targetSelector: '#test-btn' },
      { id: '2', badge: 'Paso 2', title: 'Ventana chat', description: 'Aquí es la conversación', targetSelector: '#test-chat' },
      { id: '3', badge: 'Paso 3', title: 'Listo', description: 'Todo configurado' },
    ],
  }

  it('renders nothing when isOpen is false', () => {
    render(
      <GuidedTourSpotlight
        config={mockConfig}
        dontShowAgain={false}
        isOpen={false}
        onClose={vi.fn()}
        onDismiss={vi.fn()}
        onToggleDontShowAgain={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders step 1 and advances through spotlight steps', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const onClose = vi.fn()
    const onToggleDontShowAgain = vi.fn()

    render(
      <div>
        <button id="test-btn" type="button">Nuevo</button>
        <div id="test-chat">Chat</div>
        <GuidedTourSpotlight
          config={mockConfig}
          dontShowAgain={false}
          isOpen={true}
          onClose={onClose}
          onDismiss={onDismiss}
          onToggleDontShowAgain={onToggleDontShowAgain}
        />
      </div>,
    )

    // Step 1
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Paso 1')).toBeInTheDocument()
    expect(screen.getByText('Crear solicitudes')).toBeInTheDocument()
    expect(screen.getByText('Haz clic aquí para crear más')).toBeInTheDocument()
    expect(screen.queryByText('Atrás')).not.toBeInTheDocument()

    // Click next -> Step 2
    const nextBtn = screen.getByRole('button', { name: /Siguiente/i })
    await user.click(nextBtn)

    expect(screen.getByText('Paso 2')).toBeInTheDocument()
    expect(screen.getByText('Ventana chat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Atrás/i })).toBeInTheDocument()

    // Click next -> Step 3 (Last step)
    await user.click(screen.getByRole('button', { name: /Siguiente/i }))
    expect(screen.getByText('Paso 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /¡Entendido!/i })).toBeInTheDocument()

    // Click ¡Entendido! -> onDismiss called
    await user.click(screen.getByRole('button', { name: /¡Entendido!/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape key and close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <GuidedTourSpotlight
        config={mockConfig}
        dontShowAgain={false}
        isOpen={true}
        onClose={onClose}
        onDismiss={vi.fn()}
        onToggleDontShowAgain={vi.fn()}
      />,
    )

    const closeBtn = screen.getByRole('button', { name: 'Cerrar tour' })
    await user.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('toggles dontShowAgain checkbox', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    render(
      <GuidedTourSpotlight
        config={mockConfig}
        dontShowAgain={false}
        isOpen={true}
        onClose={vi.fn()}
        onDismiss={vi.fn()}
        onToggleDontShowAgain={onToggle}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: /No volver a mostrar/i })
    await user.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith(true)
  })
})
