import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Cpu, FileSpreadsheet, FileText, Folder } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { WorkspaceFileItem, WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import styles from './FilesScreen.module.css'

const dateFormatter = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim()

function getFileKind(language: string): 'spice' | 'pdf' | 'data' {
  if (language === 'spice' || language === 'cir') return 'spice'
  if (language === 'pdf') return 'pdf'
  return 'data'
}

function getFileKindLabel(kind: 'spice' | 'pdf' | 'data'): string {
  switch (kind) {
    case 'spice': return 'Netlist SPICE'
    case 'pdf': return 'Reporte PDF'
    case 'data': return 'Datos / CSV'
  }
}

export function FilesScreen({ service }: { service: WorkspaceService }) {
  const [files, setFiles] = useState<WorkspaceFileItem[] | null>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'spice' | 'pdf' | 'data'>('all')
  const [projectFilter, setProjectFilter] = useState('all')

  useEffect(() => {
    let current = true
    Promise.all([service.getFiles(), service.getSnapshot()]).then(
      ([nextFiles, nextSnapshot]) => {
        if (current) {
          setFiles(nextFiles)
          setSnapshot(nextSnapshot)
        }
      },
      () => {
        if (current) setLoadError(true)
      },
    )
    return () => { current = false }
  }, [service])

  const rows = useMemo(() => {
    if (!Array.isArray(files)) return []
    const term = normalize(query)
    return files.filter((file) => {
      const kind = getFileKind(file.language)
      const projectName = snapshot?.projects.find((p) => p.id === file.projectId)?.name ?? 'Sin proyecto'
      const matchesKind = kindFilter === 'all' || kind === kindFilter
      const matchesProject = projectFilter === 'all' || (projectFilter === 'unassigned' ? file.projectId === null : file.projectId === projectFilter)
      const matchesSearch = !term || normalize(`${file.name} ${file.conversationTitle} ${projectName}`).includes(term)
      return matchesKind && matchesProject && matchesSearch
    })
  }, [files, kindFilter, projectFilter, query, snapshot])

  const stats = useMemo(() => {
    if (!Array.isArray(files)) return { total: 0, spice: 0, pdf: 0, data: 0 }
    return {
      total: files.length,
      spice: files.filter((f) => getFileKind(f.language) === 'spice').length,
      pdf: files.filter((f) => getFileKind(f.language) === 'pdf').length,
      data: files.filter((f) => getFileKind(f.language) === 'data').length,
    }
  }, [files])

  return (
    <section aria-labelledby="files-title" className={styles.directory}>
      <header>
        <p className={styles.eyebrow}>Workspace</p>
        <h1 id="files-title">Archivos y Artefactos</h1>
        <p>Explora todos los netlists SPICE, reportes PDF y datos generados en tus proyectos.</p>
      </header>

      <div className={styles.statsBar}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total de Archivos</p>
          <p className={styles.statValue}>{stats.total}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Netlists SPICE</p>
          <p className={styles.statValue}>{stats.spice}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Reportes PDF</p>
          <p className={styles.statValue}>{stats.pdf}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Conjuntos de Datos</p>
          <p className={styles.statValue}>{stats.data}</p>
        </div>
      </div>

      <div className={styles.filters}>
        <label>
          Buscar archivos
          <input
            aria-label="Buscar archivos"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre de archivo, proyecto o conversación…"
            type="search"
            value={query}
          />
        </label>
        <label>
          Tipo de archivo
          <select
            aria-label="Tipo de archivo"
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            value={kindFilter}
          >
            <option value="all">Todos los tipos</option>
            <option value="spice">Netlist SPICE (.cir)</option>
            <option value="pdf">Reporte PDF (.pdf)</option>
            <option value="data">Datos / Simulación</option>
          </select>
        </label>
        <label>
          Proyecto
          <select
            aria-label="Proyecto"
            onChange={(e) => setProjectFilter(e.target.value)}
            value={projectFilter}
          >
            <option value="all">Todos los proyectos</option>
            <option value="unassigned">Sin proyecto</option>
            {snapshot?.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!files && !loadError ? <p role="status">Cargando archivos…</p> : null}
      {loadError ? <p role="alert">No pudimos cargar los archivos.</p> : null}
      {files && rows.length === 0 ? (
        <div className={styles.emptyState}>
          <Folder size={40} style={{ opacity: 0.4, margin: '0 auto 1rem' }} />
          <p>No se encontraron archivos con los filtros seleccionados.</p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Tipo</th>
                <th>Conversación</th>
                <th>Proyecto</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((file) => {
                const kind = getFileKind(file.language)
                return (
                  <tr key={file.id}>
                    <td>
                      <div className={styles.fileNameCell}>
                        <div className={styles.fileIcon} data-kind={kind}>
                          {kind === 'spice' ? <Cpu size={16} /> : kind === 'pdf' ? <FileText size={16} /> : <FileSpreadsheet size={16} />}
                        </div>
                        <div className={styles.fileMeta}>
                          <span className={styles.fileName}>{file.name}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.fileTypeBadge} data-type={kind}>
                        {getFileKindLabel(kind)}
                      </span>
                    </td>
                    <td>
                      <Link to={`/conversations/${file.conversationId}`} className={styles.conversationLink}>
                        {file.conversationTitle}
                      </Link>
                    </td>
                    <td>
                      {file.projectId ? (
                        <Link to={`/projects/${file.projectId}`} className={styles.conversationLink}>
                          {snapshot?.projects.find((p) => p.id === file.projectId)?.name ?? 'Proyecto'}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>Sin proyecto</span>
                      )}
                    </td>
                    <td>
                      <time dateTime={file.createdAt}>
                        {dateFormatter.format(new Date(file.createdAt))}
                      </time>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {kind === 'spice' && (
                          <Link
                            to={`/visualizer?conversationId=${file.conversationId}&fileId=${file.id}`}
                            className={styles.actionBtn}
                            title="Visualizar circuito esquemático"
                          >
                            <span>Visualizar</span>
                            <ArrowUpRight size={13} />
                          </Link>
                        )}
                        <Link
                          to={`/conversations/${file.conversationId}`}
                          className={styles.actionBtn}
                          title="Ver en conversación"
                        >
                          <span>Ver</span>
                          <ArrowUpRight size={13} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
