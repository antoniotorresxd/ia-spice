import { Calculator, Check, ChevronDown, Crown, FileText, PenTool, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { AgentAssignment, AgentAssignmentInput, AgentId, LlmConnection } from '../model/settings-types'
import styles from './ModelSettingsScreen.module.css'

const agents: ReadonlyArray<Pick<AgentAssignment, 'agentId' | 'label'>> = [
  { agentId: 'orchestrator', label: 'Orquestador' },
  { agentId: 'calculation', label: 'Cálculo' },
  { agentId: 'writer', label: 'Escritura' },
  { agentId: 'curator', label: 'Curador' },
]

const agentDetails: Record<AgentId, { icon: ReactNode; desc: string; badge: string }> = {
  orchestrator: {
    icon: <Crown size={18} />,
    desc: 'Coordina el flujo multiagente y descompone las especificaciones del circuito.',
    badge: 'Orquestación general',
  },
  calculation: {
    icon: <Calculator size={18} />,
    desc: 'Ejecuta simulaciones numéricas, dimensionamiento E24 y puntos de operación.',
    badge: 'Análisis numérico',
  },
  writer: {
    icon: <FileText size={18} />,
    desc: 'Redacta los informes técnicos y síntesis pedagógica de resultados.',
    badge: 'Documentación técnica',
  },
  curator: {
    icon: <ShieldCheck size={18} />,
    desc: 'Valida la netlist ngspice y verifica tolerancias y restricciones de seguridad.',
    badge: 'Control de calidad',
  },
}

function ModelSelect({
  value,
  models,
  onChange,
  onSwitchToManual,
  onOpenChange,
}: {
  value: string
  models: string[]
  onChange: (model: string) => void
  onSwitchToManual: () => void
  onOpenChange?: (open: boolean) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('mousedown', onDocClick)
      document.addEventListener('keydown', onKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const getModelBadge = (m: string) => {
    const l = m.toLowerCase()
    if (l.includes('openai') || l.includes('gpt')) return 'OpenAI'
    if (l.includes('google') || l.includes('gemma') || l.includes('gemini')) return 'Google'
    if (l.includes('anthropic') || l.includes('claude')) return 'Anthropic'
    if (l.includes('qwen')) return 'Qwen'
    if (l.includes('deepseek')) return 'DeepSeek'
    if (l.includes('embed')) return 'Embed'
    return 'LLM'
  }

  const isCurrentNotInList = value && !models.includes(value)
  const allOptions = isCurrentNotInList ? [value, ...models] : models

  return (
    <div
      className={styles.customSelectWrapper}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      ref={containerRef}
    >
      <select
        aria-label="Modelo"
        className={styles.srOnlySelect}
        onChange={(e) => {
          if (e.target.value === '__custom__') onSwitchToManual()
          else onChange(e.target.value)
        }}
        tabIndex={-1}
        value={value}
      >
        <option value="">Selecciona un modelo…</option>
        {allOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value="__custom__">✏️ Escribir otro modelo…</option>
      </select>

      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={styles.customSelectTrigger}
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
      >
        <span className={styles.triggerContent}>
          {value ? (
            <>
              <span className={styles.inlineBadge} data-provider={getModelBadge(value).toLowerCase()}>
                {getModelBadge(value)}
              </span>
              <span className={styles.modelNameText}>{value}</span>
            </>
          ) : (
            <span className={styles.placeholderText}>Selecciona un modelo…</span>
          )}
        </span>
        <ChevronDown className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} size={14} />
      </button>

      {isOpen && (
        <div className={styles.customDropdownMenu} role="listbox">
          <div className={styles.dropdownHeader}>
            <span>Modelos descubiertos ({allOptions.length})</span>
          </div>
          <div className={styles.dropdownScroll}>
            {allOptions.map((m) => {
              const isSelected = m === value
              const badge = getModelBadge(m)
              return (
                <div
                  aria-selected={isSelected}
                  className={`${styles.dropdownItem} ${isSelected ? styles.dropdownItemSelected : ''}`}
                  key={m}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(m)
                    setIsOpen(false)
                  }}
                  role="option"
                >
                  <span className={styles.optionBadge} data-provider={badge.toLowerCase()}>
                    {badge}
                  </span>
                  <span className={styles.optionLabel}>{m}</span>
                  {isSelected && <Check className={styles.checkIcon} size={14} />}
                </div>
              )
            })}
          </div>
          <div className={styles.dropdownFooter}>
            <button
              className={styles.customModelOptionBtn}
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(false)
                onSwitchToManual()
              }}
              type="button"
            >
              <PenTool size={12} />
              <span>Escribir otro modelo manualmente…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type Props = {
  assignments: AgentAssignment[]
  attentionAgentIds?: ReadonlySet<AgentId>
  connections: LlmConnection[]
  onFetchModels?: (connectionId: string) => Promise<string[]>
  onSave(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}

type RowProps = {
  assignment: AgentAssignment
  attention: boolean
  connections: LlmConnection[]
  onFetchModels?: (connectionId: string) => Promise<string[]>
  onSave(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}

function AssignmentRow({ assignment, attention, connections, onFetchModels, onSave }: RowProps) {
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [connectionId, setConnectionId] = useState(assignment.connectionId ?? '')
  const [model, setModel] = useState(assignment.model)
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    if (!connectionId || !onFetchModels) {
      return
    }
    queueMicrotask(() => {
      if (current) setIsFetchingModels(true)
    })
    onFetchModels(connectionId)
      .then((models) => {
        if (current && Array.isArray(models)) {
          setDiscoveredModels(models)
        }
      })
      .catch(() => {
        if (current) setDiscoveredModels([])
      })
      .finally(() => {
        if (current) setIsFetchingModels(false)
      })
    return () => { current = false }
  }, [connectionId, onFetchModels])

  async function save() {
    setSubmitting(true)
    setError(false)
    try {
      await onSave(assignment.agentId, { connectionId: connectionId || null, model })
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const [isManualInput, setIsManualInput] = useState(false)

  const configured = Boolean(connectionId && model.trim())
  const hasDiscovered = discoveredModels.length > 0
  const meta = agentDetails[assignment.agentId]

  return (
    <li
      aria-label={assignment.label}
      className={styles.agentCard}
      data-open={isSelectOpen ? 'true' : undefined}
      role="listitem"
    >
      <div className={styles.agentCardHeader}>
        <div className={styles.agentCardIdentity}>
          <div className={`${styles.agentAvatar} ${styles[`agentAvatar_${assignment.agentId}`]}`}>
            {meta?.icon ?? <Sparkles size={18} />}
          </div>
          <div>
            <h3>{assignment.label}</h3>
            <span className={styles.agentBadge}>{meta?.badge ?? 'Agente especializado'}</span>
          </div>
        </div>
        <p
          className={configured ? styles.configuredStatus : styles.unconfiguredStatus}
          aria-label={attention ? `Asignación de ${assignment.label} requiere atención` : undefined}
          role={attention ? 'alert' : undefined}
        >
          {configured ? 'Configurado' : 'Sin configurar'}
        </p>
      </div>

      <p className={styles.agentDescription}>{meta?.desc}</p>

      <div className={styles.agentFields}>
        <label className={styles.agentField}>
          <span>Conexión</span>
          <select
            value={connectionId}
            onChange={(event) => {
              setConnectionId(event.target.value)
              setDiscoveredModels([])
              setIsManualInput(false)
            }}
          >
            <option value="">Sin conexión</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.agentField}>
          <div className={styles.fieldLabelRow}>
            <span>Modelo</span>
            {isFetchingModels ? <small className={styles.fetchingText}>Consultando modelos…</small> : null}
          </div>
          {hasDiscovered && !isManualInput ? (
            <ModelSelect
              models={discoveredModels}
              onChange={(next) => setModel(next)}
              onOpenChange={setIsSelectOpen}
              onSwitchToManual={() => setIsManualInput(true)}
              value={model}
            />
          ) : (
            <div className={styles.manualInputWrapper}>
              <input
                placeholder={discoveredModels[0] ? `Ej. ${discoveredModels[0]}` : 'Nombre del modelo…'}
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
              {hasDiscovered && (
                <button
                  type="button"
                  onClick={() => setIsManualInput(false)}
                  title="Volver al desplegable de modelos"
                  className={styles.modelToggleBtn}
                >
                  Lista
                </button>
              )}
            </div>
          )}
        </label>
      </div>

      {error ? (
        <p className={styles.assignmentError} role="alert">
          No pudimos guardar la asignación. Inténtalo de nuevo.
        </p>
      ) : null}

      <div className={styles.agentCardFooter}>
        <button
          className={styles.saveButton}
          disabled={submitting}
          onClick={() => void save()}
          type="button"
        >
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </li>
  )
}

export function AgentAssignmentList({ assignments, attentionAgentIds = new Set(), connections, onFetchModels, onSave }: Props) {
  return (
    <ul aria-label="Asignaciones de agentes" className={styles.assignmentGrid}>
      {agents.map((agent) => {
        const assignment = assignments.find((item) => item.agentId === agent.agentId) ?? {
          ...agent,
          connectionId: null,
          model: '',
        }
        return (
          <AssignmentRow
            assignment={assignment}
            attention={attentionAgentIds.has(agent.agentId)}
            connections={connections}
            key={`${agent.agentId}:${assignment.connectionId ?? ''}:${assignment.model}`}
            onFetchModels={onFetchModels}
            onSave={onSave}
          />
        )
      })}
    </ul>
  )
}
