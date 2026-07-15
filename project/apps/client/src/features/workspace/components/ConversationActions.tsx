import { useState } from 'react'

import type { WorkspaceProject } from '../model/workspace-types'

type ConversationActionsProps = {
  conversationId: string
  conversationTitle: string
  currentProjectId: string | null
  onAssign: (conversationId: string, projectId: string, previousProjectId: string | null) => Promise<void> | void
  projects: WorkspaceProject[]
}

export function ConversationActions({ conversationId, conversationTitle, currentProjectId, onAssign, projects }: ConversationActionsProps) {
  const [open, setOpen] = useState(false)
  return (
    <span>
      <button aria-expanded={open} aria-haspopup="menu" aria-label={`Mover a proyecto ${conversationTitle}`} onClick={() => setOpen((value) => !value)} type="button">Mover a proyecto</button>
      {open ? (
        <span aria-label={`Proyectos para ${conversationTitle}`} role="menu">
          {projects.filter(({ id }) => id !== currentProjectId).map((project) => (
            <button key={project.id} onClick={() => { setOpen(false); void onAssign(conversationId, project.id, currentProjectId) }} role="menuitem" type="button">{project.name}</button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
