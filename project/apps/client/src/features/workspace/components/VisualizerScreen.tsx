import { ArrowUpRight, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type {
  WorkspaceConversationDetail,
  WorkspaceFileItem,
  WorkspaceSnapshot,
} from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { NetlistDiagram } from './NetlistDiagram'
import styles from './VisualizerScreen.module.css'

const DEFAULT_CIRCUIT = `.title Divisor de voltaje
V1 in 0 DC 10
R1 in out 1000.0
R2 out 0 2200.0
.control
op
.endc
.end`

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
          }
        })
        .catch(() => {
          // Ignorar fallo puntual
        })
    }
  }

  const handleTextareaChange = (newCode: string) => {
    setCode(newCode)
    // Si el usuario edita o pega texto manualmente, desvincular del archivo del workspace
    if (selectedWorkspaceFileId || queryFileId || queryConversationId) {
      setSelectedWorkspaceFileId('')
      setActiveFileSummary(null)
      setSearchParams({}, { replace: true })
    }
  }

  const handleDraw = () => {
    setDrawnNetlist(code)
  }

  const currentWorkspaceFile = useMemo(
    () => spiceFiles.find((f) => f.id === activeWorkspaceFileId),
    [spiceFiles, activeWorkspaceFileId],
  )

  const isCustomCode = !activeWorkspaceFileId

  return (
    <article className={styles.container}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>SPICE → ESQUEMÁTICO</span>
        <h1 className={styles.title}>De netlist a diagrama que se entiende</h1>
        <p className={styles.subtitle}>
          Pegá el .cir que genera el agente de síntesis y mirá qué circuito describe, sin saber leer SPICE.
        </p>
      </header>

      <div className={styles.workbenchGrid}>
        {/* Left Column: NETLIST Card */}
        <aside className={styles.netlistCard} aria-label="Editor y selector de netlist">
          <p className={styles.cardEyebrow}>NETLIST</p>

          {/* Selector de archivos del workspace */}
          <div className={styles.workspaceImportRow}>
            <label htmlFor="workspace-file-select" className={styles.importLabel}>
              Importar de conversaciones:
            </label>
            <select
              id="workspace-file-select"
              aria-label="Seleccionar netlist"
              className={styles.workspaceSelect}
              value={activeWorkspaceFileId}
              onChange={(e) => handleSelectWorkspaceFile(e.target.value)}
            >
              <option value="">
                {isCustomCode
                  ? '✏️ Código personalizado (o elegir archivo)...'
                  : 'Seleccionar netlist del workspace...'}
              </option>
              {spiceFiles.map((file) => {
                const proj = snapshot?.projects.find((p) => p.id === file.projectId)?.name ?? 'Sin proyecto'
                return (
                  <option key={file.id} value={file.id}>
                    {file.name} — {file.conversationTitle} ({proj})
                  </option>
                )
              })}
            </select>
            {currentWorkspaceFile && (
              <Link
                to={`/conversations/${currentWorkspaceFile.conversationId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.75rem',
                  color: '#ea8144',
                  textDecoration: 'none',
                  marginTop: '0.2rem',
                }}
              >
                <span>Ver conversación de origen</span>
                <ArrowUpRight size={12} />
              </Link>
            )}
          </div>

          {/* Textarea */}
          <div className={styles.textareaWrap}>
            <textarea
              aria-label="Código netlist SPICE"
              className={styles.textarea}
              value={code}
              placeholder="Pegá aquí el código SPICE (.cir)..."
              onChange={(e) => handleTextareaChange(e.target.value)}
              spellCheck={false}
              rows={16}
            />
          </div>

          {/* Action Button */}
          <button
            type="button"
            className={styles.drawButton}
            onClick={handleDraw}
          >
            <Play size={16} fill="currentColor" />
            <span>Dibujar circuito</span>
          </button>
        </aside>

        {/* Right Column: Display Area */}
        <section className={styles.displayColumn} aria-label="Visualización y análisis del circuito">
          <NetlistDiagram netlistText={drawnNetlist} workspaceSummary={activeFileSummary} />
        </section>
      </div>
    </article>
  )
}
