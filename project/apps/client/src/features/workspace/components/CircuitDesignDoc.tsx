import { BookOpen, CheckCircle2, Cpu } from 'lucide-react'

import {
  componentValue,
  describeCircuit,
  measurementText,
  type ParsedNetlist,
} from '../model/netlist-diagram'
import { structureWalkthrough } from '../model/walkthrough-format'
import type { CircuitDocumentation } from '../model/workspace-types'
import { MarkdownText } from './MarkdownText'
import styles from './CircuitDesignDoc.module.css'

export interface CircuitDesignDocProps {
  netlist: ParsedNetlist
  documentation?: CircuitDocumentation | null
  fileName?: string
}

export function CircuitDesignDoc({
  netlist,
  documentation,
  fileName,
}: CircuitDesignDocProps) {
  const explanation = documentation?.summary || describeCircuit(netlist)
  const tags: string[] = documentation?.tags ?? []
  const measurementExplanation = documentation?.measurementExplanation
  const roles = documentation?.components ?? {}
  const hasRoles = netlist.elements.some((e) => roles[e.name])
  const walkthrough = documentation?.designWalkthrough

  return (
    <article className={styles.designDoc} aria-label="Cómo se diseñó el circuito">
      {/* Encabezado unificado de la memoria */}
      <header className={styles.docHeader}>
        <div className={styles.headerMetaRow}>
          <span className={styles.categoryBadge}>
            <BookOpen size={13} className={styles.categoryIcon} />
            {walkthrough ? 'Memoria Técnica de Diseño' : 'Documentación Técnica'}
          </span>
          {fileName && (
            <span className={styles.fileBadge}>
              <Cpu size={12} className={styles.fileIcon} />
              {fileName}
            </span>
          )}
        </div>

        {walkthrough && (
          <h2 className={styles.docTitle}>Memoria de diseño</h2>
        )}

        {tags.length > 0 && (
          <ul aria-label="Etiquetas del circuito" className={styles.tagList}>
            {tags.map((tag: string, idx: number) => (
              <li key={`${tag}-${idx}`} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* 1. Visión general y funcionamiento del circuito */}
      <section className={styles.sectionBlock}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionDot} />
          <h3 className={styles.sectionTitle}>Funcionamiento del circuito</h3>
        </div>
        <div className={styles.overviewCard}>
          <MarkdownText className={styles.overviewText}>{explanation}</MarkdownText>
        </div>
      </section>

      {/* 2. Proceso de cálculo y dimensionamiento (Memoria de diseño) */}
      {walkthrough && (
        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot} />
            <h3 className={styles.sectionTitle}>Proceso de cálculo y dimensionamiento</h3>
          </div>
          <div className={styles.walkthroughCard}>
            <MarkdownText className={styles.walkthroughBody}>
              {structureWalkthrough(walkthrough)}
            </MarkdownText>
          </div>
        </section>
      )}

      {/* 3. Parámetros de medición y validación */}
      {(measurementExplanation || netlist.measurements.length > 0) && (
        <section className={styles.sectionBlock}>
          <div className={styles.measureCallout}>
            <div className={styles.measureHeader}>
              <CheckCircle2 size={14} className={styles.measureIcon} />
              <span className={styles.measurePrefix}>Parámetros de medición</span>
            </div>
            {measurementExplanation && (
              <MarkdownText className={styles.measureExplanation}>{measurementExplanation}</MarkdownText>
            )}
            {netlist.measurements.length > 0 && (
              <span className={styles.measureContent}>
                {measurementText(netlist.measurements)}
              </span>
            )}
          </div>
        </section>
      )}

      {/* 4. Especificación y funciones de componentes */}
      <section className={styles.sectionBlock}>
        <div className={styles.tableHeaderRow}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionDot} />
            <span className={styles.tableTitle}>Componentes ({netlist.elements.length})</span>
          </div>
        </div>
        <div className={styles.tableScrollWrap}>
          <table className={styles.componentTable}>
            <thead>
              <tr>
                <th>Componente</th>
                <th>Entre nodos</th>
                <th>Valor</th>
                {hasRoles && <th>Función</th>}
              </tr>
            </thead>
            <tbody>
              {netlist.elements.map((e) => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td>
                    <span className={styles.nodePills}>
                      {e.nodes.map((n, idx) => (
                        <span key={idx} className={styles.nodePill}>{n}</span>
                      ))}
                    </span>
                  </td>
                  <td>{componentValue(e)}</td>
                  {hasRoles && <td className={styles.componentRole}>{roles[e.name] ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  )
}
