import type {
  WorkspaceConversationDetail,
  WorkspaceProject,
} from './workspace-types'

const date = (day: number) => `2026-07-${String(day).padStart(2, '0')}T12:00:00.000Z`

export const workspaceProjectFixtures: WorkspaceProject[] = [
  {
    id: 'project-filters',
    name: 'Filtros analógicos',
    description: 'Diseño y simulación de filtros activos y pasivos.',
    conversationIds: ['conversation-rc', 'conversation-active-filter'],
    updatedAt: date(14),
  },
  {
    id: 'project-amplifiers',
    name: 'Amplificadores',
    description: 'Etapas de ganancia y acondicionamiento de señal.',
    conversationIds: ['conversation-opamp', 'conversation-bjt'],
    updatedAt: date(13),
  },
  {
    id: 'project-power',
    name: 'Electrónica de potencia',
    description: 'Fuentes y convertidores de energía.',
    conversationIds: ['conversation-regulator'],
    updatedAt: date(12),
  },
]

const conversation = (
  id: string,
  projectId: string | null,
  title: string,
  status: 'active' | 'completed' | 'failed',
  fileStatus: 'complete' | 'partial',
  day: number,
): WorkspaceConversationDetail => ({
  id,
  projectId,
  title,
  preview: `Solicitud para ${title.toLocaleLowerCase()}`,
  updatedAt: date(day),
  executionStatus: status,
  messages: [
    { id: `${id}-message-1`, role: 'user', content: title, createdAt: date(day) },
    {
      id: `${id}-message-2`,
      role: 'assistant',
      content: `Preparé una propuesta para ${title.toLocaleLowerCase()}.`,
      createdAt: date(day),
    },
  ],
  files: [
    {
      id: `${id}-file-1`,
      name: `${id}.cir`,
      language: 'spice',
      content: fileStatus === 'complete' ? '* Netlist listo\n.end' : '* Netlist en progreso',
      status: fileStatus,
    },
  ],
  execution: { id: `${id}-execution`, status, summary: `Ejecución ${status}` },
})

export const workspaceConversationFixtures: WorkspaceConversationDetail[] = [
  conversation('conversation-rc', 'project-filters', 'Filtro RC pasa bajas', 'completed', 'complete', 14),
  conversation('conversation-active-filter', 'project-filters', 'Filtro activo de segundo orden', 'active', 'partial', 14),
  conversation('conversation-opamp', 'project-amplifiers', 'Amplificador no inversor', 'completed', 'complete', 13),
  conversation('conversation-bjt', 'project-amplifiers', 'Polarización de transistor BJT', 'failed', 'partial', 11),
  conversation('conversation-regulator', 'project-power', 'Regulador lineal', 'completed', 'complete', 12),
  conversation('conversation-unassigned', null, 'Divisor de voltaje', 'active', 'partial', 15),
]
