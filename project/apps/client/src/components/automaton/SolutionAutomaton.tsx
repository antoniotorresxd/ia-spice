import { Component } from 'react'

import {
  AUTOMATON_EDGES,
  AUTOMATON_STATES,
  AUTOMATON_TIMELINE,
  AUTOMATON_TONES,
  type AutomatonTone,
} from './automaton-model'
import styles from './SolutionAutomaton.module.css'

export interface SolutionAutomatonProps {
  stepDurationMs?: number
}

interface SolutionAutomatonState {
  timelineIndex: number
}

const toneClasses: Record<AutomatonTone, string> = {
  main: styles.main,
  violet: styles.violet,
  terminal: styles.terminal,
  muted: styles.muted,
}

let nextInstanceId = 0

export class SolutionAutomaton extends Component<
  SolutionAutomatonProps,
  SolutionAutomatonState
> {
  state: SolutionAutomatonState = { timelineIndex: 0 }

  private readonly idPrefix = `solution-automaton-${nextInstanceId++}`
  private readonly reducedMotionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  )
  private intervalId: number | undefined

  componentDidMount() {
    this.reducedMotionQuery.addEventListener(
      'change',
      this.handleReducedMotionChange,
    )
    if (!this.reducedMotionQuery.matches) this.startInterval()
  }

  componentWillUnmount() {
    this.reducedMotionQuery.removeEventListener(
      'change',
      this.handleReducedMotionChange,
    )
    this.stopInterval()
  }

  private readonly handleReducedMotionChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      this.stopInterval()
    } else {
      this.startInterval()
    }
  }

  private readonly startInterval = () => {
    if (this.intervalId !== undefined) return

    this.intervalId = window.setInterval(() => {
      this.setState(({ timelineIndex }) => ({
        timelineIndex: (timelineIndex + 1) % AUTOMATON_TIMELINE.length,
      }))
    }, this.props.stepDurationMs ?? 1_400)
  }

  private readonly stopInterval = () => {
    if (this.intervalId === undefined) return

    window.clearInterval(this.intervalId)
    this.intervalId = undefined
  }

  render() {
    const currentStep = AUTOMATON_TIMELINE[this.state.timelineIndex]
    const titleId = `${this.idPrefix}-title`
    const descriptionId = `${this.idPrefix}-description`

    return (
      <div className={styles.viewport}>
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className={styles.canvas}
          role="img"
          viewBox="0 0 820 420"
        >
          <title id={titleId}>Autómata del proceso de solución</title>
          <desc id={descriptionId}>
            Flujo del orquestador al cálculo y la síntesis, con evaluación del
            curador, un ciclo de ajuste y salidas aceptada o rechazada.
          </desc>

          <defs>
            <marker
              id={`${this.idPrefix}-arrow-track`}
              markerHeight="8"
              markerUnits="strokeWidth"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
              viewBox="0 0 8 8"
            >
              <path className={styles.trackArrow} d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
            {AUTOMATON_TONES.map((tone) => (
              <marker
                id={`${this.idPrefix}-arrow-${tone}`}
                key={tone}
                markerHeight="8"
                markerUnits="strokeWidth"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path className={toneClasses[tone]} d="M 0 0 L 8 4 L 0 8 z" />
              </marker>
            ))}
          </defs>

          <g aria-label="Transiciones">
          {AUTOMATON_EDGES.map((edge) => {
            const isActive = currentStep.edge === edge.id

            return (
              <g
                className={`${styles.edge} ${toneClasses[edge.tone]}`}
                data-active={isActive}
                data-testid={`edge-${edge.id}`}
                key={edge.id}
              >
                <path
                  className={styles.edgeTrack}
                  d={edge.path}
                  markerEnd={`url(#${this.idPrefix}-arrow-track)`}
                />
                <path
                  className={styles.edgePulse}
                  d={edge.path}
                  markerEnd={`url(#${this.idPrefix}-arrow-${edge.tone})`}
                  pathLength="1"
                />
                <text
                  className={styles.edgeLabel}
                  textAnchor="middle"
                  x={edge.labelX}
                  y={edge.labelY}
                >
                  {edge.label}
                </text>
              </g>
            )
          })}
          </g>

          <g aria-label="Estados">
          {AUTOMATON_STATES.map((state) => {
            const isActive = currentStep.state === state.id

            return (
              <g
                aria-label={`${state.label}: ${state.caption}`}
                className={`${styles.state} ${toneClasses[state.tone]}`}
                data-active={isActive}
                data-testid={`state-${state.id}`}
                key={state.id}
                transform={`translate(${state.x} ${state.y})`}
              >
                {state.tone === 'terminal' && (
                  <rect
                    className={styles.terminalRing}
                    height="64"
                    rx="24"
                    width="120"
                    x="-60"
                    y="-32"
                  />
                )}
                <rect
                  className={styles.stateBody}
                  height="56"
                  rx="20"
                  width="112"
                  x="-56"
                  y="-28"
                />
                <text className={styles.stateLabel} textAnchor="middle" y="-2">
                  {state.label}
                </text>
                <text className={styles.stateCaption} textAnchor="middle" y="16">
                  {state.caption}
                </text>
              </g>
            )
          })}
          </g>
        </svg>
      </div>
    )
  }
}
