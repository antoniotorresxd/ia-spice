import { CardSpotlight } from '@/components/ui/card-spotlight'
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
        <section aria-label="Lista de proyectos" className={styles.projectGrid}>
          {projects.map((project) => (
            <article aria-labelledby={`project-${project.id}`} key={project.id}>
              <CardSpotlight className={styles.projectCard}>
                <div className={styles.cardHeading}>
                  <span aria-hidden="true" className={styles.projectIcon}>◇</span>
                  <h2 id={`project-${project.id}`}><Link to={`/projects/${project.id}`}>{project.name}</Link></h2>
                </div>
                <p className={styles.description}>{project.description || 'Sin descripción'}</p>
                <div className={styles.cardMetrics}>
                  <span><strong>{project.conversationIds.length}</strong> conversaciones</span>
                  <span><strong>{project.fileCount}</strong> archivos</span>
                </div>
                <p className={styles.updated}>Actualizado <time dateTime={project.updatedAt}>{dateFormatter.format(new Date(project.updatedAt))}</time></p>
              </CardSpotlight>
            </article>
          ))}
        </section>
      )}

      {dialogOpen && <CreateProjectDialog createProject={(input) => service.createProject(input)} onClose={closeDialog} onCreated={handleCreated} />}
    </section>
  )
}
