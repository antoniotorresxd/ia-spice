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

const STATE_METADATA: Record<string, { tag: string; desc: string; latency: string }> = {
  start: {
    tag: 'INPUT',
    desc: 'Especificaciones de circuito • Topología inicial y restricciones AC/DC',
    latency: '0.4ms',
  },
  orchestrator: {
    tag: 'AGENT-01',
    desc: 'Agente Orquestador • Descomponiendo metas y coordinando ciclo de diseño',
    latency: '1.2ms',
  },
  calculation: {
    tag: 'SOLVER',
    desc: 'Agente Numérico • Resolviendo ecuaciones analíticas de punto de operación',
    latency: '4.8ms',
  },
  synthesis: {
    tag: 'SYNTH',
    desc: 'Agente de Síntesis • Generando Netlist SPICE con componentes normalizados',
    latency: '2.1ms',
  },
  curator: {
    tag: 'EVAL-02',
    desc: 'Agente Curador • Ejecutando simulación ngspice y contrastando métricas',
    latency: '8.6ms',
  },
  accepted: {
    tag: 'VERIFIED',
    desc: 'Solución Verificada • Cero violaciones de diseño; circuito aceptado',
    latency: '0.1ms',
  },
  rejected: {
    tag: 'REVISE',
    desc: 'Iteración de Parámetros • Ajustando tolerancias para re-síntesis',
    latency: '1.9ms',
  },
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
    const activeMeta = STATE_METADATA[currentStep.state] || {
      tag: 'PROCESS',
      desc: 'Pipeline de diseño multiagente SPICE',
      latency: '2.4ms',
    }

    return (
      <div className={styles.viewport}>
        {/* Sleek top status header */}
        <div className={styles.hudHeader}>
          <div className={styles.hudBadge}>
            <span className={styles.livePulse} />
            <span className={styles.hudBadgeText}>SPICE Engine Core</span>
            <span className={styles.hudTag}>{activeMeta.tag}</span>
          </div>
          <div className={styles.hudMetrics}>
            <span className={styles.hudLatency}>{activeMeta.latency}</span>
            <span className={styles.hudStepCounter}>
              {this.state.timelineIndex + 1} / {AUTOMATON_TIMELINE.length}
            </span>
          </div>
        </div>

        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className={styles.canvas}
          role="img"
          viewBox="10 65 790 315"
        >
          <title id={titleId}>Autómata del proceso de solución</title>
          <desc id={descriptionId}>
            Flujo del orquestador al cálculo y la síntesis, con evaluación del
            curador, un ciclo de ajuste y salidas aceptada o rechazada.
          </desc>

          <defs>
            {/* Diffuse glow aura for active state */}
            <radialGradient id={`${this.idPrefix}-aura-copper`}>
              <stop offset="0%" stopColor="#c8793d" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#c8793d" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#c8793d" stopOpacity="0" />
            </radialGradient>

            <radialGradient id={`${this.idPrefix}-aura-cyan`}>
              <stop offset="0%" stopColor="#45d6c4" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#45d6c4" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#45d6c4" stopOpacity="0" />
            </radialGradient>

            {/* Specular top sheen gradient */}
            <linearGradient id={`${this.idPrefix}-node-sheen`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="40%" stopColor="#ffffff" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Arrowhead markers */}
            <marker
              id={`${this.idPrefix}-arrow-track`}
              markerHeight="8"
              markerUnits="userSpaceOnUse"
              markerWidth="8"
              orient="auto"
              refX="6"
              refY="4"
              viewBox="0 0 8 8"
            >
              <path className={styles.trackArrow} d="M 1 1.5 L 6 4 L 1 6.5 z" />
            </marker>
            {AUTOMATON_TONES.map((tone) => (
              <marker
                id={`${this.idPrefix}-arrow-${tone}`}
                key={tone}
                markerHeight="8"
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                orient="auto"
                refX="6"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path className={toneClasses[tone]} d="M 1 1.5 L 6 4 L 1 6.5 z" />
              </marker>
            ))}
          </defs>

          {/* Micro PCB circuit grid texture in background */}
          <g className={styles.circuitGridLines} opacity="0.12">
            <line x1="30" y1="105" x2="770" y2="105" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 8" />
            <line x1="30" y1="205" x2="770" y2="205" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 8" />
            <line x1="30" y1="305" x2="770" y2="305" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 8" />
            <line x1="220" y1="70" x2="220" y2="350" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 8" />
            <line x1="520" y1="70" x2="520" y2="350" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 8" />
          </g>

          {/* Trace Transitions */}
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
                  {/* Fine structural track */}
                  <path
                    className={styles.edgeTrack}
                    d={edge.path}
                    markerEnd={`url(#${this.idPrefix}-arrow-track)`}
                  />
                  {/* Sharp dynamic pulse with glow */}
                  <path
                    className={styles.edgePulse}
                    d={edge.path}
                    markerEnd={`url(#${this.idPrefix}-arrow-${edge.tone})`}
                    pathLength="1"
                  />
                  {/* Solder / junction pads */}
                  <circle className={styles.junctionDot} cx={edge.labelX - 18} cy={edge.labelY - 4} r="1.5" />
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

          {/* State Nodes */}
          <g aria-label="Estados">
            {AUTOMATON_STATES.map((state) => {
              const isActive = currentStep.state === state.id
              const isCyan = state.tone === 'violet' || state.tone === 'terminal'
              const auraGradient = isCyan
                ? `url(#${this.idPrefix}-aura-cyan)`
                : `url(#${this.idPrefix}-aura-copper)`

              return (
                <g
                  aria-label={`${state.label}: ${state.caption}`}
                  className={`${styles.state} ${toneClasses[state.tone]}`}
                  data-active={isActive}
                  data-testid={`state-${state.id}`}
                  key={state.id}
                  transform={`translate(${state.x} ${state.y})`}
                >
                  {/* Active diffuse breathing aura */}
                  <circle
                    className={styles.activeAura}
                    cx="0"
                    cy="0"
                    r="55"
                    fill={auraGradient}
                  />

                  {/* Outer terminal ring */}
                  {state.tone === 'terminal' && (
                    <rect
                      className={styles.terminalRing}
                      height="64"
                      rx="20"
                      width="122"
                      x="-61"
                      y="-32"
                    />
                  )}

                  {/* Main squircle glass node */}
                  <rect
                    className={styles.stateBody}
                    height="56"
                    rx="14"
                    width="112"
                    x="-56"
                    y="-28"
                  />

                  {/* Top specular highlight sheen */}
                  <rect
                    className={styles.stateSheen}
                    height="28"
                    rx="14"
                    width="112"
                    x="-56"
                    y="-28"
                    fill={`url(#${this.idPrefix}-node-sheen)`}
                  />

                  {/* Micro circuit notch accents */}
                  <line x1="-50" y1="-22" x2="-44" y2="-22" className={styles.notchMark} />
                  <line x1="-50" y1="-22" x2="-50" y2="-16" className={styles.notchMark} />

                  <line x1="50" y1="22" x2="44" y2="22" className={styles.notchMark} />
                  <line x1="50" y1="22" x2="50" y2="16" className={styles.notchMark} />

                  {/* Status Beacon dot */}
                  <circle
                    className={styles.nodeBeacon}
                    cx="-38"
                    cy="-6"
                    r="2.5"
                  />

                  <text className={styles.stateLabel} textAnchor="middle" y="-2">
                    {state.label}
                  </text>
                  <text className={styles.stateCaption} textAnchor="middle" y="15">
                    {state.caption}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Live Agent Telemetry Bar */}
        <div className={styles.telemetryBar}>
          <div className={styles.telemetryIndicator}>
            <span className={styles.telemetryDot} />
            <span className={styles.telemetryText}>{activeMeta.desc}</span>
          </div>
          <div className={styles.telemetrySignalMeter}>
            <span className={styles.meterBar} style={{ height: '35%' }} />
            <span className={styles.meterBar} style={{ height: '70%' }} />
            <span className={styles.meterBar} style={{ height: '100%' }} />
            <span className={styles.meterBar} style={{ height: '55%' }} />
            <span className={styles.meterLabel}>SYNC</span>
          </div>
        </div>
      </div>
    )
  }
}
