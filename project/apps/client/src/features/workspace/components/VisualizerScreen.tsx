import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileCode2,
  Play,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { parseNetlist } from '../model/netlist-diagram'
import type {
  BlockSimResult,
  WorkspaceConversationDetail,
  WorkspaceFileItem,
  WorkspaceSnapshot,
} from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { CircuitExplanation, NetlistDiagram } from './NetlistDiagram'
import { SimulationChart } from './SimulationChart'
import { SpiceCodeEditor } from './SpiceCodeEditor'
import styles from './VisualizerScreen.module.css'

const DEFAULT_CIRCUIT = `.title Divisor de voltaje
V1 in 0 DC 10
R1 in out 1000.0
R2 out 0 2200.0
.control
op
.endc
.end`

function WorkspaceFileSelect({
  files,
  activeFileId,
  onSelect,
  projects,
}: {
  files: WorkspaceFileItem[]
  activeFileId: string
  onSelect: (fileId: string) => void
  projects?: { id: string; name: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  const selectedFile = files.find((f) => f.id === activeFileId)

  return (
    <div ref={dropdownRef} className={styles.customSelectWrapper}>
      {/* Hidden/accessible select for form & tests */}
      <select
        id="workspace-file-select"
        aria-label="Seleccionar netlist"
        className={styles.srOnlySelect}
        value={activeFileId}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">
          {!activeFileId
            ? '✏️ Código personalizado (o elegir archivo)...'
            : 'Seleccionar netlist del workspace...'}
        </option>
        {files.map((file) => {
          const proj = projects?.find((p) => p.id === file.projectId)?.name ?? 'Sin proyecto'
          return (
            <option key={file.id} value={file.id}>
              {file.name} — {file.conversationTitle} ({proj})
            </option>
          )
        })}
      </select>

      {/* Visual trigger button */}
      <button
        type="button"
        className={`${styles.customSelectTrigger} ${isOpen ? styles.customSelectTriggerActive : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className={styles.triggerContent}>
          {selectedFile ? (
            <>
              <FileCode2 size={16} className={styles.fileIcon} />
              <div className={styles.selectedFileMeta}>
                <span className={styles.selectedFileName}>{selectedFile.name}</span>
                <span className={styles.selectedFileSub}>{selectedFile.conversationTitle}</span>
              </div>
            </>
          ) : (
            <span className={styles.placeholderText}>
              Código manual (o elegir de conversaciones)...
            </span>
          )}
        </div>
        <ChevronDown size={15} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
      </button>

      {/* Visual dropdown list */}
      {isOpen && (
        <div className={styles.customDropdownMenu}>
          <div className={styles.dropdownHeader}>
            <span>Archivos SPICE ({files.length})</span>
          </div>

          <button
            type="button"
            className={`${styles.dropdownItem} ${!activeFileId ? styles.dropdownItemActive : ''}`}
            onClick={() => {
              onSelect('')
              setIsOpen(false)
            }}
          >
            <div className={styles.itemMain}>
              <span className={styles.itemTitle}>Código manual / pegado</span>
              <span className={styles.itemSubtitle}>Escribí o pegá código SPICE libremente</span>
            </div>
            {!activeFileId && <Check size={14} className={styles.itemCheck} />}
          </button>

          {files.length > 0 ? (
            <div className={styles.dropdownItemList}>
              {files.map((file) => {
                const isSelected = file.id === activeFileId
                const proj = projects?.find((p) => p.id === file.projectId)?.name
                return (
                  <button
                    key={file.id}
                    type="button"
                    className={`${styles.dropdownItem} ${isSelected ? styles.dropdownItemActive : ''}`}
                    onClick={() => {
                      onSelect(file.id)
                      setIsOpen(false)
                    }}
                  >
                    <div className={styles.itemMain}>
                      <div className={styles.itemTitleRow}>
                        <span className={styles.itemTitle}>{file.name}</span>
                        {proj && <span className={styles.itemProjectBadge}>{proj}</span>}
                      </div>
                      <span className={styles.itemSubtitle}>{file.conversationTitle}</span>
                    </div>
                    {isSelected && <Check size={14} className={styles.itemCheck} />}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className={styles.emptyDropdown}>No hay archivos SPICE en el workspace</div>
          )}
        </div>
      )}
    </div>
  )
}

export function VisualizerScreen({ service }: { service: WorkspaceService }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryConversationId = searchParams.get('conversationId')
  const queryFileId = searchParams.get('fileId')

  const [code, setCode] = useState<string>(DEFAULT_CIRCUIT)
  const [drawnNetlist, setDrawnNetlist] = useState<string>(DEFAULT_CIRCUIT)
  const [files, setFiles] = useState<WorkspaceFileItem[] | null>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [selectedWorkspaceFileId, setSelectedWorkspaceFileId] = useState<string>('')
  const [activeFileSummary, setActiveFileSummary] = useState<string | null>(null)
  const [activeFileSimResult, setActiveFileSimResult] = useState<BlockSimResult | null>(null)
  const [viewMode, setViewMode] = useState<'schematic' | 'code' | 'simulation'>('schematic')
  const [cache, setCache] = useState<Record<string, WorkspaceConversationDetail>>({})

  // Cargar lista de archivos y snapshot
  useEffect(() => {
    let current = true
    Promise.all([service.getFiles(), service.getSnapshot()])
      .then(([nextFiles, nextSnapshot]) => {
        if (!current) return
        setFiles(nextFiles)
        setSnapshot(nextSnapshot)
      })
      .catch(() => {
        // Fallo de red
      })
    return () => {
      current = false
    }
  }, [service])

  // Filtrar archivos SPICE del workspace
  const spiceFiles = useMemo(() => {
    if (!files) return []
    return files.filter(
      (file) => file.language === 'spice' || file.language === 'cir' || file.name.endsWith('.cir'),
    )
  }, [files])

  // Resolver el archivo activo sincronizado con query params o selección de usuario
  const activeWorkspaceFileId = useMemo(() => {
    if (selectedWorkspaceFileId) return selectedWorkspaceFileId
    const target =
      (queryFileId ? spiceFiles.find((f) => f.id === queryFileId) : null) ||
      (queryConversationId ? spiceFiles.find((f) => f.conversationId === queryConversationId) : null)
    return target ? target.id : ''
  }, [selectedWorkspaceFileId, queryFileId, queryConversationId, spiceFiles])

  // Si hay un archivo activo de workspace, cargar su contenido
  useEffect(() => {
    if (!activeWorkspaceFileId || spiceFiles.length === 0) return
    const targetFile = spiceFiles.find((f) => f.id === activeWorkspaceFileId)
    if (!targetFile) return

    const convId = targetFile.conversationId
    let current = true

    const loadContent = async () => {
      let detail = cache[convId]
      if (!detail) {
        detail = await service.getConversation(convId)
        if (!current) return
        setCache((prev) => ({ ...prev, [convId]: detail }))
      }
      if (!current) return
      const fileObj = detail.files.find((f) => f.id === targetFile.id)
      if (fileObj?.content) {
        setCode(fileObj.content)
        setDrawnNetlist(fileObj.content)
        setActiveFileSummary(fileObj.summary ?? null)
        setActiveFileSimResult(fileObj.simResult ?? null)
      }
    }

    void loadContent().catch(() => {
      // Ignorar fallo puntual
    })

    return () => {
      current = false
    }
  }, [activeWorkspaceFileId, spiceFiles, service, cache])

  const handleSelectWorkspaceFile = (fileId: string) => {
    setSelectedWorkspaceFileId(fileId)
    if (!fileId) {
      setActiveFileSummary(null)
      setActiveFileSimResult(null)
      setSearchParams({}, { replace: true })
      return
    }

    const targetFile = spiceFiles.find((f) => f.id === fileId)
    if (!targetFile) return

    setSearchParams({ conversationId: targetFile.conversationId, fileId: targetFile.id }, { replace: true })

    const convId = targetFile.conversationId
    if (cache[convId]) {
      const fileObj = cache[convId].files.find((f) => f.id === targetFile.id)
      if (fileObj?.content) {
        setCode(fileObj.content)
        setDrawnNetlist(fileObj.content)
        setActiveFileSummary(fileObj.summary ?? null)
        setActiveFileSimResult(fileObj.simResult ?? null)
      }
    } else {
      service
        .getConversation(convId)
        .then((detail) => {
          setCache((prev) => ({ ...prev, [convId]: detail }))
          const fileObj = detail.files.find((f) => f.id === targetFile.id)
          if (fileObj?.content) {
            setCode(fileObj.content)
            setDrawnNetlist(fileObj.content)
            setActiveFileSummary(fileObj.summary ?? null)
            setActiveFileSimResult(fileObj.simResult ?? null)
          }
        })
        .catch(() => {
          // Ignorar fallo puntual
        })
    }
  }

  const handleDraw = () => {
    setDrawnNetlist(code)
  }

  const currentWorkspaceFile = useMemo(
    () => spiceFiles.find((f) => f.id === activeWorkspaceFileId),
    [spiceFiles, activeWorkspaceFileId],
  )

  const parsedNetlist = useMemo(() => {
    try {
      return parseNetlist(drawnNetlist)
    } catch {
      return null
    }
  }, [drawnNetlist])

  return (
    <article className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.eyebrow}>Visualizador de Circuitos</span>
          <h1 className={styles.title}>Visualizador y Análisis de Netlist</h1>
        </div>
        <p className={styles.subtitle}>
          Explora la topología del circuito, inspecciona el código SPICE y analiza las curvas de simulación en tiempo real.
        </p>
      </header>

      {/* Barra de Control / Toolbar Unificada */}
      <div className={styles.toolbar}>
        {/* Fila 1: Selección del Circuito, Actualizar y Origen */}
        <div className={styles.toolbarTopRow}>
          <div className={styles.circuitControlGroup} data-tour="circuit-selector">
            <div className={styles.workspaceImportRow}>
              <label htmlFor="workspace-file-select" className={styles.importLabel}>
                Circuito:
              </label>
              <WorkspaceFileSelect
                files={spiceFiles}
                activeFileId={activeWorkspaceFileId}
                onSelect={handleSelectWorkspaceFile}
                projects={snapshot?.projects}
              />
            </div>

            <button
              type="button"
              className={styles.drawButton}
              onClick={handleDraw}
              title="Actualizar diagrama y análisis con el código actual"
            >
              <Play size={13} fill="currentColor" />
              <span>Actualizar</span>
            </button>
          </div>

          {currentWorkspaceFile && (
            <Link
              to={`/conversations/${currentWorkspaceFile.conversationId}`}
              className={styles.originLink}
              title="Ir a la conversación donde se generó este archivo"
            >
              <span>Ver conversación</span>
              <ArrowUpRight size={13} />
            </Link>
          )}
        </div>

        {/* Separador */}
        <div className={styles.toolbarDivider} />

        {/* Fila 2: Selector de Vistas */}
        <div className={styles.toolbarBottomRow}>
          <div className={styles.viewToggleWrap} data-tour="view-toggle">
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${viewMode === 'schematic' ? styles.viewToggleBtnActive : ''}`}
              onClick={() => setViewMode('schematic')}
            >
              <span>Diagrama Esquemático</span>
            </button>
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${viewMode === 'code' ? styles.viewToggleBtnActive : ''}`}
              onClick={() => setViewMode('code')}
            >
              <FileCode2 size={13} />
              <span>Código Netlist SPICE</span>
            </button>
            {activeFileSimResult && (
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${viewMode === 'simulation' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('simulation')}
              >
                <Activity size={13} />
                <span>Curva de Simulación SPICE</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visor Central (Diagrama / Editor de Código / Curva) */}
      <section className={styles.viewerSection} data-tour="circuit-viewer" aria-label="Lienzo y visualización del circuito">
        {viewMode === 'simulation' && activeFileSimResult ? (
          <SimulationChart
            curve={activeFileSimResult.curve}
            analysisType={activeFileSimResult.analysis_type}
            xUnit={activeFileSimResult.x_unit}
            yUnit={activeFileSimResult.y_unit}
            xLabel={activeFileSimResult.x_label}
            simError={activeFileSimResult.sim_error}
            metricName={activeFileSimResult.metric_name}
            measuredValue={activeFileSimResult.measured_value}
            targetValue={activeFileSimResult.target_value}
            title={`Simulación SPICE: ${currentWorkspaceFile?.name ?? 'Circuito'}`}
          />
        ) : viewMode === 'code' ? (
          <SpiceCodeEditor
            code={code}
            fileName={currentWorkspaceFile?.name ?? 'Código Netlist SPICE'}
          />
        ) : (
          <NetlistDiagram
            netlistText={drawnNetlist}
            workspaceSummary={activeFileSummary}
            showExplanation={false}
          />
        )}
      </section>

      {/* Sección Inferior: Análisis y Funcionamiento del Circuito */}
      <section className={styles.explanationSection} data-tour="circuit-explanation" aria-label="Análisis y funcionamiento del circuito">
        {parsedNetlist ? (
          <>
            <CircuitExplanation
              netlist={parsedNetlist}
              workspaceSummary={activeFileSummary}
              compact={false}
            />
          </>
        ) : (
          <div className={styles.inspectorPlaceholder}>
            <p>No se pudo interpretar el netlist. Revisa la sintaxis SPICE o presiona "Actualizar" para refrescar el análisis.</p>
          </div>
        )}
      </section>
    </article>
  )
}

