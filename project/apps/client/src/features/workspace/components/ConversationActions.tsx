import { useState } from 'react'
import { FolderInput, Trash2 } from 'lucide-react'

import type { WorkspaceProject } from '../model/workspace-types'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'

type ConversationActionsProps = {
  conversationId: string
  conversationTitle: string
  currentProjectId: string | null
  onAssign?: (conversationId: string, projectId: string, previousProjectId: string | null) => Promise<void> | void
  onDelete?: (conversationId: string) => Promise<void> | void
  projects: Array<Pick<WorkspaceProject, 'id' | 'name'>>
}

export function ConversationActions({
  conversationId,
  conversationTitle,
  currentProjectId,
  onAssign,
  onDelete,
  projects,
}: ConversationActionsProps) {
  const [open, setOpen] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  return (
    <span className="home-conversation-actions">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Mover a proyecto ${conversationTitle}`}
        className="home-conversation-action-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((value) => !value)
        }}
        title={`Mover a proyecto ${conversationTitle}`}
        type="button"
      >
        <FolderInput aria-hidden="true" size={13} />
        <span className="home-action-sr">Mover a proyecto</span>
      </button>
      {open ? (
        <span
          aria-label={`Proyectos para ${conversationTitle}`}
          className="home-conversation-menu"
          role="menu"
        >
          <span className="home-conversation-menu-header">Mover a:</span>
          {projects
            .filter(({ id }) => id !== currentProjectId)
            .map((project) => (
              <button
                key={project.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  void onAssign?.(conversationId, project.id, currentProjectId)
                }}
                role="menuitem"
                type="button"
              >
                {project.name}
              </button>
            ))}
          {onDelete && (
            <button
              className="home-action-menu-delete"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                setIsConfirmingDelete(true)
              }}
              role="menuitem"
              type="button"
            >
              <Trash2 size={12} aria-hidden="true" />
              <span>Eliminar</span>
            </button>
          )}
        </span>
      ) : null}
      <ConfirmDeleteModal
        isOpen={isConfirmingDelete}
        title={`¿Eliminar conversación "${conversationTitle}"?`}
        description="Esta acción no se puede deshacer y se eliminarán sus ejecuciones asociadas."
        confirmLabel="Eliminar conversación"
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={async () => {
          setIsConfirmingDelete(false)
          await onDelete?.(conversationId)
        }}
      />
    </span>
  )
}
