import styles from './Skeleton.module.css'

/**
 * Single shimmering placeholder bar.
 */
export function SkeletonBar({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style = {},
  className = '',
}: {
  width?: number | string
  height?: number | string
  borderRadius?: number | string
  style?: React.CSSProperties
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`${styles.bar} ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  )
}

/**
 * Inline skeleton for ProjectsScreen — renders directly into the projects grid.
 */
export function ProjectsGridSkeleton({
  count = 6,
  label = 'Cargando proyectos…',
}: {
  count?: number
  label?: string
}) {
  const titles = ['65%', '80%', '50%', '75%', '60%', '70%']

  return (
    <section aria-label="Lista de proyectos" className={styles.projectGrid} role="status">
      <span className={styles.srOnly}>{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <article key={i}>
          <div className={styles.skeletonCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <SkeletonBar borderRadius={6} height={28} width={28} />
              <SkeletonBar height={20} width={titles[i % titles.length]} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '1rem 0 1.5rem' }}>
              <SkeletonBar height={13} width="92%" />
              <SkeletonBar height={13} width="65%" />
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', marginTop: 'auto' }}>
              <SkeletonBar borderRadius={9999} height={24} width={110} />
              <SkeletonBar borderRadius={9999} height={24} width={85} />
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <SkeletonBar height={12} width={130} />
            </div>
          </div>
        </article>
      ))}
    </section>
  )
}

/**
 * Inline skeleton for ConversationsScreen table.
 */
export function ConversationsTableSkeleton({
  rows = 6,
  label = 'Cargando conversaciones…',
  tableWrapClass = '',
}: {
  rows?: number
  label?: string
  tableWrapClass?: string
}) {
  const titles = ['65%', '80%', '55%', '72%', '60%', '75%']
  const previews = ['45%', '55%', '40%', '50%', '42%', '48%']

  return (
    <div className={tableWrapClass} role="status">
      <span className={styles.srOnly}>{label}</span>
      <table>
        <thead>
          <tr>
            <th>Conversación</th>
            <th>Proyecto</th>
            <th>Estado</th>
            <th>Actualizada</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <SkeletonBar height={15} width={titles[i % titles.length]} />
                  <SkeletonBar height={12} style={{ opacity: 0.55 }} width={previews[i % previews.length]} />
                </div>
              </td>
              <td>
                <SkeletonBar height={14} width="60%" />
              </td>
              <td>
                <SkeletonBar borderRadius={9999} height={22} width={72} />
              </td>
              <td>
                <SkeletonBar height={13} width={85} />
              </td>
              <td>
                <SkeletonBar borderRadius={6} height={30} width={30} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Inline skeleton for FilesScreen table.
 */
export function FilesTableSkeleton({
  rows = 6,
  label = 'Cargando archivos…',
  tableWrapClass = '',
}: {
  rows?: number
  label?: string
  tableWrapClass?: string
}) {
  const names = ['55%', '70%', '45%', '65%', '50%', '60%']

  return (
    <div className={tableWrapClass} role="status">
      <span className={styles.srOnly}>{label}</span>
      <table>
        <thead>
          <tr>
            <th>Archivo</th>
            <th>Proyecto</th>
            <th>Tipo</th>
            <th>Tamaño</th>
            <th>Actualizado</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <SkeletonBar borderRadius={8} height={32} width={32} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    <SkeletonBar height={15} width={names[i % names.length]} />
                    <SkeletonBar height={11} style={{ opacity: 0.5 }} width="35%" />
                  </div>
                </div>
              </td>
              <td>
                <SkeletonBar height={14} width="55%" />
              </td>
              <td>
                <SkeletonBar borderRadius={9999} height={20} width={56} />
              </td>
              <td>
                <SkeletonBar height={13} width={48} />
              </td>
              <td>
                <SkeletonBar height={13} width={76} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Inline skeleton for ProjectScreen detail (tabs + item list).
 */
export function ProjectDetailSkeleton({
  label = 'Cargando proyecto…',
  listClass = '',
}: {
  label?: string
  listClass?: string
}) {
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <span className={styles.srOnly}>{label}</span>

      {/* Header skeleton */}
      <div>
        <SkeletonBar height={12} style={{ marginBottom: '0.5rem' }} width={80} />
        <SkeletonBar height={32} width="40%" />
        <SkeletonBar height={14} style={{ marginTop: '0.5rem' }} width="60%" />
      </div>

      {/* Tab bar skeleton */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <SkeletonBar borderRadius={8} height={36} width={130} />
        <SkeletonBar borderRadius={8} height={36} width={110} />
      </div>

      {/* List rows skeleton */}
      <ul className={listClass} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '1rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <SkeletonBar height={16} width={['50%', '65%', '40%', '55%'][i]} />
            <SkeletonBar height={12} style={{ opacity: 0.55 }} width={['75%', '85%', '60%', '70%'][i]} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Inline skeleton for ConversationScreen (hero header + messages).
 */
export function ConversationDetailSkeleton({
  label = 'Cargando conversación…',
}: {
  label?: string
}) {
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      <span className={styles.srOnly}>{label}</span>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <SkeletonBar height={14} width={90} />
        <SkeletonBar height={14} width={140} />
      </div>

      {/* Hero */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '60%' }}>
          <SkeletonBar height={12} width={70} />
          <SkeletonBar height={32} width="80%" />
        </div>
        <SkeletonBar borderRadius={9999} height={24} width={90} />
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: '1rem' }}>
        {[100, 90, 85].map((w, i) => (
          <SkeletonBar borderRadius={8} height={40} key={i} width={w} />
        ))}
      </div>

      {/* Messages viewport */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
        {/* User bubble */}
        <div className={styles.messageBubbleUser}>
          <SkeletonBar height={14} width="85%" />
          <SkeletonBar height={14} width="55%" />
        </div>

        {/* Assistant response card */}
        <div className={styles.messageBubbleAssistant}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SkeletonBar borderRadius={6} height={20} width={20} />
            <SkeletonBar height={14} width={120} />
          </div>
          <SkeletonBar height={14} width="95%" />
          <SkeletonBar height={14} width="80%" />
          <SkeletonBar height={14} width="60%" />
        </div>
      </div>
    </div>
  )
}

/**
 * Inline skeleton for ProfileSettingsScreen (hero profile card + personal info card + mascot card).
 */
export function ProfileSettingsSkeleton({
  label = 'Cargando perfil…',
}: {
  label?: string
}) {
  return (
    <div aria-busy="true" className={styles.profileSkeleton} role="status">
      <span className={styles.srOnly}>{label}</span>

      {/* Header */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <SkeletonBar height={14} width={120} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SkeletonBar height={36} width={200} />
          <SkeletonBar borderRadius={9999} height={26} width={160} />
        </div>
        <SkeletonBar height={14} width={280} />
      </header>

      {/* Hero Profile Card */}
      <div className={styles.profileHeroSkeleton}>
        <div className={styles.profileHeroBanner} />
        <div className={styles.profileHeroContent}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.25rem' }}>
            <SkeletonBar borderRadius="50%" height={80} style={{ flexShrink: 0 }} width={80} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <SkeletonBar height={22} width={180} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <SkeletonBar height={14} width={160} />
                <SkeletonBar borderRadius={9999} height={20} width={80} />
              </div>
            </div>
          </div>
          <SkeletonBar borderRadius={9999} height={38} width={140} />
        </div>
      </div>

      {/* Personal Info Card */}
      <div className={styles.settingsCardSkeleton}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <SkeletonBar borderRadius={12} height={36} width={36} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <SkeletonBar height={18} width={180} />
            <SkeletonBar height={12} width={260} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <SkeletonBar height={14} width={70} />
            <SkeletonBar borderRadius={8} height={42} width="100%" />
            <SkeletonBar height={11} width={220} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <SkeletonBar height={14} width={120} />
            <SkeletonBar borderRadius={8} height={42} width="100%" />
            <SkeletonBar height={11} width={250} />
          </div>
        </div>
      </div>

      {/* Mascot Settings Card */}
      <div className={styles.settingsCardSkeleton}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <SkeletonBar borderRadius={12} height={36} width={36} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <SkeletonBar height={18} width={210} />
            <SkeletonBar height={12} width={320} />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '0.75rem',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <SkeletonBar height={14} width={220} />
            <SkeletonBar height={12} width={300} />
          </div>
          <SkeletonBar borderRadius={9999} height={24} width={44} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))', gap: '0.75rem' }}>
          {[1, 2, 3, 4].map((idx) => (
            <SkeletonBar borderRadius={12} height={80} key={idx} width="100%" />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Inline skeleton for ModelSettingsScreen (Connections grid + Agent assignments list).
 */
export function ModelSettingsSkeleton({
  label = 'Cargando conexiones…',
}: {
  label?: string
}) {
  return (
    <div aria-busy="true" className={styles.modelSkeleton} role="status">
      <span className={styles.srOnly}>{label}</span>

      <div className={styles.sections}>
        {/* Section 1: Conexiones */}
        <section className={styles.sectionSkeleton}>
          <div className={styles.sectionHeadingSkeleton}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <SkeletonBar height={18} width={120} />
              <SkeletonBar height={13} width={240} />
            </div>
            <SkeletonBar borderRadius={9999} height={24} width={80} />
          </div>

          <div className={styles.connectionGridSkeleton}>
            {[1, 2].map((idx) => (
              <div className={styles.connectionCardSkeleton} key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <SkeletonBar borderRadius={8} height={36} width={36} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <SkeletonBar height={16} width={110} />
                      <SkeletonBar height={12} width={70} />
                    </div>
                  </div>
                  <SkeletonBar borderRadius={9999} height={22} width={75} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 'auto',
                    paddingTop: '1rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <SkeletonBar borderRadius={8} height={30} width={70} />
                    <SkeletonBar borderRadius={8} height={30} width={65} />
                  </div>
                  <SkeletonBar borderRadius={8} height={30} width={30} />
                </div>
              </div>
            ))}
            <div className={styles.addCardSkeleton}>
              <SkeletonBar borderRadius="50%" height={36} style={{ marginBottom: '0.5rem' }} width={36} />
              <SkeletonBar height={15} style={{ marginBottom: '0.35rem' }} width={120} />
              <SkeletonBar height={11} width={160} />
            </div>
          </div>
        </section>

        {/* Section 2: Asignaciones por agente */}
        <section className={styles.sectionSkeleton}>
          <div className={styles.sectionHeadingSkeleton}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <SkeletonBar height={18} width={180} />
              <SkeletonBar height={13} width={280} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[1, 2, 3, 4].map((idx) => (
              <div className={styles.assignmentRowSkeleton} key={idx}>
                <div className={styles.assignmentRowHeaderSkeleton}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <SkeletonBar borderRadius={8} height={34} width={34} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <SkeletonBar height={15} width={130} />
                      <SkeletonBar borderRadius={9999} height={18} width={90} />
                    </div>
                  </div>
                  <SkeletonBar borderRadius={9999} height={20} width={80} />
                </div>
                <SkeletonBar height={12} style={{ margin: '0.75rem 0 1rem' }} width="70%" />
                <div className={styles.assignmentFieldsSkeleton}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    <SkeletonBar height={12} width={60} />
                    <SkeletonBar borderRadius={8} height={38} width="100%" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1.2 }}>
                    <SkeletonBar height={12} width={50} />
                    <SkeletonBar borderRadius={8} height={38} width="100%" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <SkeletonBar borderRadius={8} height={38} width={75} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

