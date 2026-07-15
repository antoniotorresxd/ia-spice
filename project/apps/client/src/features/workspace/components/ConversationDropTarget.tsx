import type { DragEvent, ReactNode } from 'react'

const workspaceConversationMime = 'application/x-workspace-conversation'

export type ConversationDragPayload = {
  conversationId: string
  previousProjectId: string | null
}

function parseConversationDragPayload(value: string): ConversationDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Record<string, unknown>
    if (typeof candidate.conversationId !== 'string' || candidate.conversationId.trim() === '') return null
    if (candidate.previousProjectId !== null && typeof candidate.previousProjectId !== 'string') return null
    return { conversationId: candidate.conversationId, previousProjectId: candidate.previousProjectId as string | null }
  } catch {
    return null
  }
}

type ConversationDropTargetProps = {
  children: ReactNode
  projectName: string
  onAssign: (payload: ConversationDragPayload) => void
}

export function ConversationDropTarget({ children, onAssign, projectName }: ConversationDropTargetProps) {
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const payload = parseConversationDragPayload(event.dataTransfer.getData(workspaceConversationMime))
    if (payload) onAssign(payload)
  }

  return <section aria-label={`Asignar a ${projectName}`} onDragOver={(event) => event.preventDefault()} onDrop={drop} role="region">{children}</section>
}
