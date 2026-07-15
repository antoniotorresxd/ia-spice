import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { WorkspaceProject, WorkspaceSnapshot } from '../model/workspace-types'
import type { WorkspaceService } from '../services/workspace-service'
import { CreateProjectDialog } from './CreateProjectDialog'
import styles from './ProjectsScreen.module.css'

type ProjectsScreenProps = { service: WorkspaceService }
type SortMode = 'updated' | 'name'

const dateFormatter = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export function ProjectsScreen({ service }: ProjectsScreenProps) {
  const navigate = useNavigate()
  const createTriggerRef = useRef<HTMLButtonElement>(null)
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('updated')
  const [dialogOpen, setDialogOpen] = useState(false)

  async function retryLoad() {
    setLoadError(false)
    try {
      setSnapshot(await service.getSnapshot())
    } catch {
      setSnapshot(null)
      setLoadError(true)
    }
  }

  useEffect(() => {
    let isCurrent = true
    service.getSnapshot().then(
      (data) => { if (isCurrent) setSnapshot(data) },
      () => { if (isCurrent) setLoadError(true) },
    )
    return () => { isCurrent = false }
  }, [service])

  const projects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    return [...(snapshot?.projects ?? [])]
      .filter(({ name, description }) => `${name} ${description}`.toLocaleLowerCase('es').includes(normalized))
      .sort((left, right) => sort === 'name'
        ? left.name.localeCompare(right.name, 'es')
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  }, [query, snapshot, sort])

  function closeDialog() {
    setDialogOpen(false)
    requestAnimationFrame(() => createTriggerRef.current?.focus())
  }

  function handleCreated(project: WorkspaceProject) {
    setDialogOpen(false)
    navigate(`/projects/${project.id}`)
  }

  return (
    <section aria-labelledby="projects-title" className={styles.screen}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Workspace</p>
          <h1 id="projects-title">Proyectos</h1>
          <p>Agrupa conversaciones, ejecuciones y archivos relacionados.</p>
        </div>
        <button aria-label="Nuevo proyecto" className={styles.primary} onClick={() => setDialogOpen(true)} ref={createTriggerRef} type="button"><span aria-hidden="true">+</span> Nuevo proyecto</button>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <span className={styles.srOnly}>Buscar proyectos</span>
          <input aria-label="Buscar proyectos" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proyectos…" type="search" value={query} />
        </label>
        <label className={styles.sort}>
          <span>Ordenar</span>
          <select aria-label="Ordenar proyectos" onChange={(event) => setSort(event.target.value as SortMode)} value={sort}>
            <option value="updated">Actualizados</option>
            <option value="name">Nombre</option>
          </select>
        </label>
      </div>

      {!snapshot && !loadError && <p className={styles.state} role="status">Cargando proyectos…</p>}
      {loadError && (
        <div className={styles.state} role="alert">
          <strong>No pudimos cargar los proyectos.</strong>
          <span>Comprueba tu conexión e inténtalo de nuevo.</span>
          <button onClick={() => void retryLoad()} type="button">Reintentar</button>
        </div>
      )}
      {snapshot && snapshot.projects.length === 0 && <p className={styles.state}>Todavía no hay proyectos.</p>}
      {snapshot && snapshot.projects.length > 0 && projects.length === 0 && <p className={styles.state}>No hay proyectos que coincidan con tu búsqueda.</p>}
      {projects.length > 0 && (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Proyecto</th><th>Conversaciones</th><th>Archivos</th><th>Actualizado</th></tr></thead>
            <tbody>{projects.map((project) => (
              <tr key={project.id}>
                <td data-label="Proyecto">
                  <span aria-hidden="true" className={styles.projectIcon}>◇</span>
                  <span><Link to={`/projects/${project.id}`}>{project.name}</Link><small>{project.description || 'Sin descripción'}</small></span>
                </td>
                <td data-label="Conversaciones"><strong>{project.conversationIds.length}</strong> conversaciones</td>
                <td data-label="Archivos"><strong>{project.fileCount}</strong> archivos</td>
                <td data-label="Actualizado"><time dateTime={project.updatedAt}>{dateFormatter.format(new Date(project.updatedAt))}</time></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {dialogOpen && <CreateProjectDialog createProject={(input) => service.createProject(input)} onClose={closeDialog} onCreated={handleCreated} />}
    </section>
  )
}
