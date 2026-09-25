import { AlertCircle, Cpu, Globe, Key, Loader2, Play, Plus, Sliders, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { AgentAssignment, AgentAssignmentInput, AgentId, ConnectionInput, LlmConnection, UserProfile } from '../model/settings-types'
import type { SettingsService } from '../services/settings-service'
import { AgentAssignmentList } from './AgentAssignmentList'
import { ConnectionForm } from './ConnectionForm'
import { SettingsShell } from './SettingsShell'
import { SettingsDialog } from './SettingsDialog'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { ModelSettingsSkeleton } from '@/components/ui/Skeleton'
import styles from './ModelSettingsScreen.module.css'
import shellStyles from './SettingsShell.module.css'

const providerLabels = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openai_compatible: 'OpenAI compatible',
} as const

function ProviderLogo({ provider }: { provider: keyof typeof providerLabels }) {
  if (provider === 'openai') {
    return (
      <span className={`${styles.providerMark} ${styles.providerMarkOpenai}`}>
        <svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.307 10.829l2.45-1.414 2.449 1.414v2.828l-2.45 1.414-2.449-1.414z" />
        </svg>
      </span>
    )
  }
  if (provider === 'anthropic') {
    return (
      <span className={`${styles.providerMark} ${styles.providerMarkAnthropic}`}>
        <Sparkles size={18} />
      </span>
    )
  }
  if (provider === 'google') {
    return (
      <span className={`${styles.providerMark} ${styles.providerMarkGoogle}`}>
        <Cpu size={18} />
      </span>
    )
  }
  return (
    <span className={`${styles.providerMark} ${styles.providerMarkCompatible}`}>
      <Globe size={18} />
    </span>
  )
}

type Props = { service: SettingsService; onSignOut?: () => Promise<void> }

export function ModelSettingsScreen({ service, onSignOut = async () => {} }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [connections, setConnections] = useState<LlmConnection[] | null>(null)
  const [assignments, setAssignments] = useState<AgentAssignment[]>([])
  const [editing, setEditing] = useState<LlmConnection | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<LlmConnection | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [attentionAgentIds, setAttentionAgentIds] = useState<Set<AgentId>>(new Set())
  const [retryKey, setRetryKey] = useState(0)
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
  const [connectionFormDirty, setConnectionFormDirty] = useState(false)
  const connectionNameRef = useRef<HTMLInputElement>(null)

  // Parámetros de iteración y tolerancia del curador SPICE
  const [curatorParams, setCuratorParams] = useState(() => {
    try {
      const iterStr = localStorage.getItem('spice_curador_max_iterations')
      const tolStr = localStorage.getItem('spice_curador_tolerance')
      const iter = iterStr ? parseInt(iterStr, 10) : 10
      const tol = tolStr ? parseFloat(tolStr) * 100 : 5
      return {
        maxIterations: isNaN(iter) ? 10 : Math.min(10, Math.max(1, iter)),
        tolerancePercent: isNaN(tol) ? 5 : Math.min(20, Math.max(0.5, tol)),
      }
    } catch {
      return { maxIterations: 10, tolerancePercent: 5 }
    }
  })

  function updateMaxIterations(val: number) {
    setCuratorParams((prev) => {
      const next = { ...prev, maxIterations: val }
      try {
        localStorage.setItem('spice_curador_max_iterations', String(val))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  function updateTolerance(percent: number) {
    setCuratorParams((prev) => {
      const next = { ...prev, tolerancePercent: percent }
      try {
        localStorage.setItem('spice_curador_tolerance', String(percent / 100))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  async function fetchCollections() {
    return Promise.all([service.listConnections(), service.listAgentAssignments()])
  }

  async function load() {
    try {
      const [nextConnections, nextAssignments] = await fetchCollections()
      setConnections(nextConnections)
      setAssignments(nextAssignments)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }

  useEffect(() => {
    let current = true
    fetchCollections()
      .then(([nextConnections, nextAssignments]) => {
        if (!current) return
        setConnections(nextConnections)
        setAssignments(nextAssignments)
        setLoadError(false)
      })
      .catch(() => { if (current) setLoadError(true) })
    return () => { current = false }
  // fetchCollections closes only over the service prop; retryKey intentionally triggers a retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, service])
  useEffect(() => { service.getProfile().then(setProfile).catch(() => {}) }, [service])

  async function save(input: ConnectionInput) {
    if (editing) await service.updateConnection(editing.id, input)
    else await service.createConnection(input)
    await load()
    setConnectionFormDirty(false)
    setEditing(undefined)
  }

  async function remove() {
    if (!deleting) return
    const affectedAgentIds = assignments
      .filter((assignment) => assignment.connectionId === deleting.id)
      .map((assignment) => assignment.agentId)
    setDeleteError('')
    try {
      await service.deleteConnection(deleting.id)
      await load()
      setAttentionAgentIds((current) => new Set([...current, ...affectedAgentIds]))
      setDeleting(null)
    } catch {
      setDeleteError('No pudimos eliminar la conexión. Inténtalo de nuevo.')
    }
  }

  async function test(connectionId: string) {
    setTesting((current) => new Set([...current, connectionId]))
    setTestErrors((current) => {
      const next = { ...current }
      delete next[connectionId]
      return next
    })
    try {
      const result = await service.testConnection(connectionId)
      if (!result.ok && 'error' in result) {
        setTestErrors((current) => ({ ...current, [connectionId]: result.error }))
      }
      await load()
    } catch {
      setTestErrors((current) => ({
        ...current,
        [connectionId]: 'No pudimos probar la conexión. Inténtalo de nuevo.',
      }))
    } finally {
      setTesting((current) => {
        const next = new Set(current)
        next.delete(connectionId)
        return next
      })
    }
  }

  const isAssigned = deleting && assignments.some((item) => item.connectionId === deleting.id)

  function dismissConnectionForm() {
    if (connectionFormDirty && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return
    setConnectionFormDirty(false)
    setEditing(undefined)
  }

  async function saveAssignment(agentId: AgentId, input: AgentAssignmentInput) {
    const saved = await service.updateAgentAssignment(agentId, input)
    setAssignments((current) => current.some((item) => item.agentId === agentId)
      ? current.map((item) => item.agentId === agentId ? saved : item)
      : [...current, saved])
    setAttentionAgentIds((current) => {
      const next = new Set(current)
      next.delete(agentId)
      return next
    })
    return saved
  }

  return (
    <SettingsShell onSignOut={onSignOut} userEmail={profile?.email ?? ''} userName={profile?.name ?? 'Cuenta'}>
      <header className={`${shellStyles.pageHeader} ${styles.pageHeader}`}>
        <div>
          <p>Configuración de IA</p>
          <h1>Modelos y providers</h1>
          <span>Conecta proveedores y decide qué modelo utiliza cada agente.</span>
        </div>
        <button className={styles.primaryButton} onClick={() => { setConnectionFormDirty(false); setEditing(null) }} type="button">
          <span aria-hidden="true">+</span>
          Nueva conexión
        </button>
      </header>
      {loadError ? <section className={shellStyles.loadState}><p role="alert">No pudimos cargar las conexiones. Inténtalo de nuevo.</p><button onClick={() => setRetryKey((value) => value + 1)} type="button">Reintentar</button></section> : null}
      {connections ? (
        <div className={styles.sections}>
        <section aria-labelledby="connections-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="connections-title">Conexiones</h2>
              <p>Credenciales y endpoints disponibles para el ecosistema.</p>
            </div>
            <span>{connections.length} {connections.length === 1 ? 'conexión' : 'conexiones'}</span>
          </div>
          {connections.length === 0 ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">✦</span>
              <div><strong>Todavía no tienes conexiones.</strong><p>Agrega un provider para comenzar a asignar modelos.</p></div>
            </div>
          ) : (
            <ul className={styles.connectionGrid}>
              {connections.map((item) => (
                <li
                  aria-label={item.label}
                  className={styles.connectionCard}
                  key={item.id}
                  onClick={() => { setConnectionFormDirty(false); setEditing(item) }}
                  role="listitem"
                >
                  <div className={styles.cardHeader}>
                    <div className={styles.cardProviderBadge}>
                      <ProviderLogo provider={item.provider} />
                      <div className={styles.cardProviderInfo}>
                        <strong className={styles.connectionTitle}>{item.label}</strong>
                        <span className={styles.providerName}>{providerLabels[item.provider]}</span>
                      </div>
                    </div>
                    <span
                      className={
                        item.lastTestStatus === 'ok'
                          ? styles.connectedStatus
                          : item.lastTestStatus === 'failed'
                            ? styles.failedStatus
                            : styles.untestedStatus
                      }
                    >
                      <i aria-hidden="true" />
                      {item.lastTestStatus === 'ok'
                        ? 'Conectado'
                        : item.lastTestStatus === 'failed'
                          ? 'Falló'
                          : 'Sin probar'}
                    </span>
                  </div>

                  <div className={styles.cardDetails}>
                    <div className={styles.detailItem}>
                      <Key className={styles.detailIcon} size={13} />
                      <span className={styles.keyHintText}>
                        {item.keyHint ? `••••${item.keyHint}` : 'Sin API key'}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <Globe className={styles.detailIcon} size={13} />
                      <span className={styles.endpointText}>
                        {item.baseUrl ? item.baseUrl : 'Endpoint administrado'}
                      </span>
                    </div>
                  </div>

                  {testErrors[item.id] ? (
                    <div className={styles.testError} role="alert">
                      <AlertCircle size={13} />
                      <span>{testErrors[item.id]}</span>
                    </div>
                  ) : null}

                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.actionGroup}>
                      <button
                        aria-label={`Probar ${item.label}`}
                        className={styles.testButton}
                        disabled={testing.has(item.id)}
                        onClick={() => void test(item.id)}
                        type="button"
                      >
                        {testing.has(item.id) ? (
                          <>
                            <Loader2 className={styles.spinner} size={12} />
                            <span>Probando…</span>
                          </>
                        ) : (
                          <>
                            <Play size={12} />
                            <span>Probar</span>
                          </>
                        )}
                      </button>
                      <button
                        aria-label={`Editar ${item.label}`}
                        className={styles.editButton}
                        onClick={() => { setConnectionFormDirty(false); setEditing(item) }}
                        type="button"
                      >
                        <Sliders size={12} />
                        <span>Editar</span>
                      </button>
                    </div>
                    <button
                      aria-label={`Eliminar ${item.label}`}
                      className={styles.deleteButton}
                      onClick={() => setDeleting(item)}
                      title="Eliminar conexión"
                      type="button"
                    >
                      <Trash2 size={12} />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </li>
              ))}
              <li
                className={styles.addConnectionCard}
                onClick={() => { setConnectionFormDirty(false); setEditing(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setConnectionFormDirty(false); setEditing(null) } }}
                role="button"
                tabIndex={0}
              >
                <div className={styles.addIconCircle}>
                  <Plus size={20} />
                </div>
                <strong>Nueva conexión</strong>
                <p>Conecta OpenAI, Anthropic, Google o modelos locales</p>
              </li>
            </ul>
          )}
        </section>
        <section aria-labelledby="agent-assignments-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <div><h2 id="agent-assignments-title">Asignaciones por agente</h2><p>Cada agente puede utilizar una conexión y un modelo diferente.</p></div>
          </div>
          <AgentAssignmentList
            assignments={assignments}
            attentionAgentIds={attentionAgentIds}
            connections={connections}
            onFetchModels={(id) => (service.listConnectionModels ? service.listConnectionModels(id) : Promise.resolve([]))}
            onSave={saveAssignment}
          />
        </section>

        <section aria-labelledby="curator-simulation-title" className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="curator-simulation-title">Parámetros del Curador y Simulación</h2>
              <p>Controla las iteraciones de ajuste y la tolerancia de convergencia para el lazo de corrección SPICE.</p>
            </div>
          </div>
          <div className={styles.curatorParamsBody}>
            <div className={styles.paramCard}>
              <div className={styles.paramHeader}>
                <div>
                  <strong>Iteraciones máximas del Curador</strong>
                  <p>Número de ciclos de ajuste en ngspice antes de declarar fallo de convergencia (1 - 10).</p>
                </div>
                <span className={styles.paramValueBadge}>{curatorParams.maxIterations} iteraciones</span>
              </div>
              <div className={styles.sliderRow}>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={curatorParams.maxIterations}
                  onChange={(e) => updateMaxIterations(Number(e.target.value))}
                  className={styles.paramSlider}
                  aria-label="Iteraciones máximas del Curador"
                />
                <div className={styles.sliderMarkers}>
                  <span>1 (Rápido)</span>
                  <span>5 (Por defecto)</span>
                  <span>10 (Máxima convergencia)</span>
                </div>
              </div>
            </div>

            <div className={styles.paramCard}>
              <div className={styles.paramHeader}>
                <div>
                  <strong>Tolerancia de diseño</strong>
                  <p>Porcentaje de desviación admitido respecto a las especificaciones deseadas.</p>
                </div>
                <span className={styles.paramValueBadge}>{curatorParams.tolerancePercent}%</span>
              </div>
              <div className={styles.sliderRow}>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={curatorParams.tolerancePercent}
                  onChange={(e) => updateTolerance(Number(e.target.value))}
                  className={styles.paramSlider}
                  aria-label="Tolerancia de diseño"
                />
                <div className={styles.sliderMarkers}>
                  <span>1% (Estricto)</span>
                  <span>5% (Típico electrónica)</span>
                  <span>20% (Holgado)</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        </div>
      ) : !loadError ? (
        <ModelSettingsSkeleton />
      ) : null}
      {editing !== undefined ? (
        <SettingsDialog ariaLabel={editing ? 'Editar conexión' : 'Nueva conexión'} initialFocusRef={connectionNameRef} onDismiss={dismissConnectionForm}>
          <p className={styles.dialogEyebrow}>{editing ? 'Actualizar provider' : 'Conectar provider'}</p>
          <h2>{editing ? 'Editar conexión' : 'Nueva conexión'}</h2>
          <p className={styles.dialogDescription}>Las credenciales permanecerán ocultas después de guardarlas.</p>
          <ConnectionForm connection={editing} nameInputRef={connectionNameRef} onCancel={dismissConnectionForm} onDirtyChange={setConnectionFormDirty} onSave={save} />
        </SettingsDialog>
      ) : null}
      <ConfirmDeleteModal
        isOpen={deleting !== null}
        ariaLabel="Eliminar conexión"
        title={`¿Eliminar conexión "${deleting?.label ?? ''}"?`}
        description={deleteError || (isAssigned ? 'Esta conexión está asignada a uno o más agentes. Sus asignaciones se quitarán.' : 'Esta acción no se puede deshacer.')}
        confirmLabel="Confirmar eliminación"
        onCancel={() => {
          setDeleting(null)
          setDeleteError('')
        }}
        onConfirm={() => void remove()}
      />
    </SettingsShell>
  )
}
