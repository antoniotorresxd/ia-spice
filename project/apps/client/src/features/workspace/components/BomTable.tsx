import { formatValue } from '../model/bom-format'
import type { BomItem } from '../model/workspace-types'
import styles from './BomTable.module.css'

function realization(item: BomItem): string {
  const parts = item.partes ?? []
  if (item.realizacion === 'simple' || parts.length < 2) {
    return formatValue(item.valor ?? 0, item.unidad)
  }
  const joiner = item.realizacion === 'serie' ? ' + ' : ' ∥ '
  return parts.map((p) => formatValue(p, item.unidad)).join(joiner)
}

function ErrorBadge({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const magnitude = Math.abs(value)
  const tone = magnitude < 1 ? styles.good : magnitude < 5 ? styles.warn : styles.bad
  return (
    <span className={`${styles.badge} ${tone}`}>
      {value > 0 ? '+' : ''}
      {value.toFixed(2)} %
    </span>
  )
}

export function BomTable({ items }: { items: BomItem[] }) {
  const passives = items.filter((item) => item.ideal !== undefined)
  const semis = items.filter((item) => item.ideal === undefined)

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Lista de materiales</h3>
      <p className={styles.subtitle}>
        Lo que se simuló es lo que se compra: cada valor teórico se llevó a su serie comercial.
      </p>

      {passives.length > 0 && (
        <table className={styles.table} aria-label="Componentes pasivos">
          <thead>
            <tr>
              <th>Ref.</th>
              <th>Cant.</th>
              <th>Teórico</th>
              <th>Comercial</th>
              <th>Serie</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {passives.map((item) => (
              <tr key={item.nombre}>
                <td className={styles.ref}>{item.nombre}</td>
                <td>{item.cantidad}</td>
                <td className={styles.muted}>{formatValue(item.ideal ?? 0, item.unidad)}</td>
                <td>
                  {realization(item)}
                  {item.realizacion && item.realizacion !== 'simple' && (
                    <span className={styles.hint}>
                      {' '}
                      ({item.realizacion}, = {formatValue(item.valor ?? 0, item.unidad)})
                    </span>
                  )}
                </td>
                <td>{item.serie}</td>
                <td>
                  <ErrorBadge value={item.error_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {semis.length > 0 && (
        <table className={styles.table} aria-label="Semiconductores">
          <thead>
            <tr>
              <th>Ref.</th>
              <th>Cant.</th>
              <th>Pieza</th>
              <th>Notas</th>
              <th>Simulación</th>
            </tr>
          </thead>
          <tbody>
            {semis.map((item) => (
              <tr key={`${item.tipo}-${item.nombre}`}>
                <td className={styles.ref}>{item.nombre}</td>
                <td>{item.cantidad}</td>
                <td>{item.pieza}</td>
                <td className={styles.muted}>{item.nota}</td>
                <td>
                  <span className={`${styles.badge} ${item.modelo_real ? styles.good : styles.warn}`}>
                    {item.modelo_real ? 'modelo real' : 'modelo genérico'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
