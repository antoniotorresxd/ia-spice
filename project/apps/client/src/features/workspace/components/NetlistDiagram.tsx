import { useMemo } from 'react'

import {
  GROUND_Y,
  type LayoutSymbol,
  NetlistParseError,
  RAIL_Y,
  buildDiagram,
  componentValue,
  describeCircuit,
  measurementText,
  parseNetlist,
} from '../model/netlist-diagram'
import styles from './NetlistDiagram.module.css'

const LEGEND_ITEMS = [
  { key: 'source', label: 'Fuente', symbol: '(~)' },
  { key: 'resistor', label: 'Resistencia', symbol: '—/\\/\\—' },
  { key: 'capacitor', label: 'Capacitor', symbol: '—||—' },
  { key: 'inductor', label: 'Inductor', symbol: '—∿∿—' },
  { key: 'ground', label: 'Tierra (0)', symbol: '⏚' },
  { key: 'led', label: 'LED', symbol: '▷|' },
  { key: 'zener', label: 'Diodo Zener', symbol: '▷|' },
  { key: 'diode', label: 'Diodo', symbol: '▷|' },
  { key: 'opamp', label: 'Amp. operacional', symbol: '▷' },
  { key: 'bjt', label: 'Transistor BJT', symbol: '(Q)' },
] as const

function ResistorZigzag({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const lead = 20
  const amp = 9
  const segs = 6
  const zx1 = x1 + lead
  const zx2 = x2 - lead
  const step = (zx2 - zx1) / segs
  const points: string[] = [`${zx1},${y}`]
  for (let i = 1; i < segs; i++) points.push(`${zx1 + i * step},${y + (i % 2 ? -amp : amp)}`)
  points.push(`${zx2},${y}`)
  return (
    <>
      <line x1={x1} y1={y} x2={zx1} y2={y} className={styles.wire} />
      <line x1={zx2} y1={y} x2={x2} y2={y} className={styles.wire} />
      <polyline points={points.join(' ')} className={styles.symbolStroke} fill="none" />
    </>
  )
}

function ResistorH({ x1, x2, y, name, value }: { x1: number; x2: number; y: number; name: string; value: string }) {
  const mx = (x1 + x2) / 2
  return (
    <g>
      <ResistorZigzag x1={x1} x2={x2} y={y} />
      <text x={mx} y={y - 18} textAnchor="middle" className={styles.lbl}>
        {name} · {value}
      </text>
    </g>
  )
}

function ResistorV({ x, y1, y2, name, value }: { x: number; y1: number; y2: number; name: string; value: string }) {
  const lead = 20
  const amp = 9
  const segs = 6
  const zy1 = y1 + lead
  const zy2 = y2 - lead
  const step = (zy2 - zy1) / segs
  const points: string[] = [`${x},${zy1}`]
  for (let i = 1; i < segs; i++) points.push(`${x + (i % 2 ? -amp : amp)},${zy1 + i * step}`)
  points.push(`${x},${zy2}`)
  const my = (y1 + y2) / 2
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={zy1} className={styles.wire} />
      <line x1={x} y1={zy2} x2={x} y2={y2} className={styles.wire} />
      <polyline points={points.join(' ')} className={styles.symbolStroke} fill="none" />
      <text x={x + 22} y={my - 2} textAnchor="start" className={styles.lbl}>
        {name}
      </text>
      <text x={x + 22} y={my + 13} textAnchor="start" className={styles.lblSub}>
        {value}
      </text>
    </g>
  )
}

function CapacitorH({ x1, x2, y, name, value }: { x1: number; x2: number; y: number; name: string; value: string }) {
  const mx = (x1 + x2) / 2
  const plateH = 14
  const gap = 4
  return (
    <g>
      <line x1={x1} y1={y} x2={mx - gap} y2={y} className={styles.wire} />
      <line x1={mx + gap} y1={y} x2={x2} y2={y} className={styles.wire} />
      <line x1={mx - gap} y1={y - plateH} x2={mx - gap} y2={y + plateH} className={styles.symbolStroke} />
      <line x1={mx + gap} y1={y - plateH} x2={mx + gap} y2={y + plateH} className={styles.symbolStroke} />
      <text x={mx} y={y - 18} textAnchor="middle" className={styles.lbl}>
        {name} · {value}
      </text>
    </g>
  )
}

function CapacitorV({ x, y1, y2, name, value }: { x: number; y1: number; y2: number; name: string; value: string }) {
  const my = (y1 + y2) / 2
  const half = 15
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={my - 4} className={styles.wire} />
      <line x1={x} y1={my + 4} x2={x} y2={y2} className={styles.wire} />
      <line x1={x - half} y1={my - 4} x2={x + half} y2={my - 4} className={styles.symbolStroke} />
      <line x1={x - half} y1={my + 4} x2={x + half} y2={my + 4} className={styles.symbolStroke} />
      <text x={x + 22} y={my - 2} textAnchor="start" className={styles.lbl}>
        {name}
      </text>
      <text x={x + 22} y={my + 13} textAnchor="start" className={styles.lblSub}>
        {value}
      </text>
    </g>
  )
}

function InductorH({ x1, x2, y, name, value }: { x1: number; x2: number; y: number; name: string; value: string }) {
  const lead = 20
  const loops = 4
  const lx1 = x1 + lead
  const lx2 = x2 - lead
  const step = (lx2 - lx1) / loops
  const r = step / 2
  const paths: string[] = []
  for (let i = 0; i < loops; i++) {
    const start = lx1 + i * step
    const end = start + step
    paths.push(`M ${start} ${y} A ${r} ${r * 1.2} 0 0 1 ${end} ${y}`)
  }
  return (
    <g>
      <line x1={x1} y1={y} x2={lx1} y2={y} className={styles.wire} />
      <line x1={lx2} y1={y} x2={x2} y2={y} className={styles.wire} />
      {paths.map((p, idx) => (
        <path key={idx} d={p} className={styles.symbolStroke} fill="none" />
      ))}
      <text x={(x1 + x2) / 2} y={y - 18} textAnchor="middle" className={styles.lbl}>
        {name} · {value}
      </text>
    </g>
  )
}

function InductorV({ x, y1, y2, name, value }: { x: number; y1: number; y2: number; name: string; value: string }) {
  const lead = 20
  const loops = 4
  const ly1 = y1 + lead
  const ly2 = y2 - lead
  const step = (ly2 - ly1) / loops
  const r = step / 2
  const paths: string[] = []
  for (let i = 0; i < loops; i++) {
    const start = ly1 + i * step
    const end = start + step
    paths.push(`M ${x} ${start} A ${r * 1.2} ${r} 0 0 1 ${x} ${end}`)
  }
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={ly1} className={styles.wire} />
      <line x1={x} y1={ly2} x2={x} y2={y2} className={styles.wire} />
      {paths.map((p, idx) => (
        <path key={idx} d={p} className={styles.symbolStroke} fill="none" />
      ))}
      <text x={x + 22} y={(y1 + y2) / 2 - 2} textAnchor="start" className={styles.lbl}>
        {name}
      </text>
      <text x={x + 22} y={(y1 + y2) / 2 + 13} textAnchor="start" className={styles.lblSub}>
        {value}
      </text>
    </g>
  )
}

function DiodeH({
  x1,
  x2,
  y,
  name,
  value,
  isLed,
  pointingRight,
}: {
  x1: number
  x2: number
  y: number
  name: string
  value: string
  isLed: boolean
  pointingRight: boolean
}) {
  const mx = (x1 + x2) / 2
  const size = 12
  const pBase = pointingRight ? mx - size : mx + size
  const pTip = pointingRight ? mx + size : mx - size
  return (
    <g>
      <line x1={x1} y1={y} x2={mx - size} y2={y} className={styles.wire} />
      <line x1={mx + size} y1={y} x2={x2} y2={y} className={styles.wire} />
      <polygon
        points={`${pBase},${y - size} ${pBase},${y + size} ${pTip},${y}`}
        className={styles.symbolStroke}
        fill="none"
      />
      <line x1={pTip} y1={y - size} x2={pTip} y2={y + size} className={styles.symbolStroke} />
      {isLed ? (
        <>
          <line x1={mx} y1={y - size - 2} x2={mx + 8} y2={y - size - 12} className={styles.symbolStroke} />
          <line x1={mx + 6} y1={y - size - 2} x2={mx + 14} y2={y - size - 12} className={styles.symbolStroke} />
        </>
      ) : null}
      <text x={mx} y={y - 18} textAnchor="middle" className={styles.lbl}>
        {name} · {value}
      </text>
    </g>
  )
}

function DiodeV({
  x,
  y1,
  y2,
  name,
  value,
  isLed,
  isZener,
  pointingUp,
}: {
  x: number
  y1: number
  y2: number
  name: string
  value: string
  isLed: boolean
  isZener: boolean
  pointingUp: boolean
}) {
  const my = (y1 + y2) / 2
  const half = 13
  const barY = pointingUp ? my - half : my + half
  const baseY = pointingUp ? my + half : my - half
  const tipY = barY

  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={my - half} className={styles.wire} />
      <line x1={x} y1={my + half} x2={x} y2={y2} className={styles.wire} />
      {/* Triángulo del diodo */}
      <polygon
        points={`${x - half},${baseY} ${x + half},${baseY} ${x},${tipY}`}
        className={styles.symbolStroke}
        fill="none"
      />
      {/* Barra de cátodo */}
      <line x1={x - half} y1={barY} x2={x + half} y2={barY} className={styles.symbolStroke} />
      {/* Alas zener características si es diodo zener */}
      {isZener ? (
        <>
          <line
            x1={x - half}
            y1={barY}
            x2={x - half}
            y2={pointingUp ? barY + 5 : barY - 5}
            className={styles.symbolStroke}
          />
          <line
            x1={x + half}
            y1={barY}
            x2={x + half}
            y2={pointingUp ? barY - 5 : barY + 5}
            className={styles.symbolStroke}
          />
        </>
      ) : null}
      {/* Flechas LED si corresponde */}
      {isLed ? (
        <>
          <line
            x1={x + half}
            y1={my - 4}
            x2={x + half + 10}
            y2={my - 14}
            className={styles.symbolStroke}
          />
          <line
            x1={x + half + 6}
            y1={my - 2}
            x2={x + half + 16}
            y2={my - 12}
            className={styles.symbolStroke}
          />
        </>
      ) : null}
      <text x={x + 22} y={my - 2} textAnchor="start" className={styles.lbl}>
        {name}
      </text>
      {value ? (
        <text x={x + 22} y={my + 13} textAnchor="start" className={styles.lblSub}>
          {value}
        </text>
      ) : null}
    </g>
  )
}

function SourceV({
  x,
  y1,
  y2,
  name,
  value,
  isAc,
}: {
  x: number
  y1: number
  y2: number
  name: string
  value: string
  isAc: boolean
}) {
  const my = (y1 + y2) / 2
  const r = 17
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={my - r} className={styles.wire} />
      <line x1={x} y1={my + r} x2={x} y2={y2} className={styles.wire} />
      <circle cx={x} cy={my} r={r} className={styles.symbolStroke} fill="none" />
      {isAc ? (
        <path d={`M ${x - 9} ${my} q 4.5 -8 9 0 q 4.5 8 9 0`} className={styles.symbolStroke} fill="none" />
      ) : (
        <>
          <line x1={x - 6} y1={my - 7} x2={x + 6} y2={my - 7} className={styles.symbolStroke} />
          <line x1={x} y1={my - 12} x2={x} y2={my - 2} className={styles.symbolStroke} />
          <line x1={x - 6} y1={my + 7} x2={x + 6} y2={my + 7} className={styles.symbolStroke} />
        </>
      )}
      <text x={x + 24} y={my - 2} textAnchor="start" className={styles.lbl}>
        {name}
      </text>
      <text x={x + 24} y={my + 13} textAnchor="start" className={styles.lblSub}>
        {value}
      </text>
    </g>
  )
}

function Opamp({ cx, inTopX, inBotX, outX }: { cx: number; inTopX: number; inBotX: number; outX: number }) {
  const w = 64
  const h = 56
  const left = cx - w / 2
  const right = cx + w / 2
  const top = RAIL_Y - h / 2
  const bot = RAIL_Y + h / 2
  return (
    <g>
      <polygon
        points={`${left},${top} ${left},${bot} ${right},${RAIL_Y}`}
        className={styles.symbolStroke}
        fill="none"
      />
      <text x={left + 10} y={top + 16} textAnchor="start" className={styles.lblSign}>
        +
      </text>
      <text x={left + 10} y={bot - 8} textAnchor="start" className={styles.lblSign}>
        −
      </text>
      <line x1={inTopX} y1={RAIL_Y} x2={left} y2={top + 14} className={styles.wire} />
      <line x1={inBotX} y1={RAIL_Y} x2={left} y2={bot - 14} className={styles.wire} />
      <line x1={right} y1={RAIL_Y} x2={outX} y2={RAIL_Y} className={styles.wire} />
      <text x={cx - 2} y={top - 26} textAnchor="middle" className={styles.lblSub}>
        U1 · opamp
      </text>
    </g>
  )
}

function Bjt({
  collectorX,
  baseX,
  emitterX,
  name,
  value,
}: {
  collectorX: number
  baseX: number
  emitterX: number
  name: string
  value: string
}) {
  // El cuerpo del transistor se dibuja a la derecha de la base, sobre el
  // mismo raíl RAIL_Y: la base entra horizontal, colector y emisor salen en
  // diagonal hacia sus propios nodos, sean cuales sean sus posiciones X
  // relativas (no asume que colector/emisor caigan a la derecha de base).
  const bodyX = baseX + 22
  const spineTop = RAIL_Y - 26
  const spineBot = RAIL_Y + 26
  return (
    <g>
      <line x1={baseX} y1={RAIL_Y} x2={bodyX} y2={RAIL_Y} className={styles.wire} />
      <line x1={bodyX} y1={spineTop} x2={bodyX} y2={spineBot} className={styles.symbolStroke} />
      <line x1={bodyX} y1={spineTop + 6} x2={bodyX + 20} y2={spineTop - 8} className={styles.symbolStroke} />
      <line x1={bodyX + 20} y1={spineTop - 8} x2={collectorX} y2={RAIL_Y} className={styles.wire} />
      <line x1={bodyX} y1={spineBot - 6} x2={bodyX + 20} y2={spineBot + 8} className={styles.symbolStroke} />
      <line x1={bodyX + 20} y1={spineBot + 8} x2={emitterX} y2={RAIL_Y} className={styles.wire} />
      <polygon
        points={`${bodyX + 11},${spineBot - 1} ${bodyX + 21},${spineBot + 3} ${bodyX + 13},${spineBot + 9}`}
        className={styles.symbolStroke}
      />
      <circle cx={bodyX + 6} cy={RAIL_Y} r={28} className={styles.symbolStroke} fill="none" />
      <text x={bodyX + 6} y={spineTop - 16} textAnchor="middle" className={styles.lblSub}>
        {name} · {value}
      </text>
    </g>
  )
}

function Ground({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + 8} className={styles.symbolStroke} />
      <line x1={x - 12} y1={y + 8} x2={x + 12} y2={y + 8} className={styles.symbolStroke} />
      <line x1={x - 7} y1={y + 13} x2={x + 7} y2={y + 13} className={styles.symbolStroke} />
      <line x1={x - 2} y1={y + 18} x2={x + 2} y2={y + 18} className={styles.symbolStroke} />
    </g>
  )
}

function Symbol({ symbol }: { symbol: LayoutSymbol }) {
  switch (symbol.type) {
    case 'resistorH':
      return <ResistorH x1={symbol.x1} x2={symbol.x2} y={symbol.y} name={symbol.name} value={symbol.value} />
    case 'resistorV':
      return <ResistorV x={symbol.x} y1={symbol.y1} y2={symbol.y2} name={symbol.name} value={symbol.value} />
    case 'capacitorH':
      return <CapacitorH x1={symbol.x1} x2={symbol.x2} y={symbol.y} name={symbol.name} value={symbol.value} />
    case 'capacitorV':
      return <CapacitorV x={symbol.x} y1={symbol.y1} y2={symbol.y2} name={symbol.name} value={symbol.value} />
    case 'inductorH':
      return <InductorH x1={symbol.x1} x2={symbol.x2} y={symbol.y} name={symbol.name} value={symbol.value} />
    case 'inductorV':
      return <InductorV x={symbol.x} y1={symbol.y1} y2={symbol.y2} name={symbol.name} value={symbol.value} />
    case 'diodeH':
      return (
        <DiodeH
          x1={symbol.x1}
          x2={symbol.x2}
          y={symbol.y}
          name={symbol.name}
          value={symbol.value}
          isLed={symbol.isLed}
          pointingRight={symbol.pointingRight}
        />
      )
    case 'diodeV':
      return (
        <DiodeV
          x={symbol.x}
          y1={symbol.y1}
          y2={symbol.y2}
          name={symbol.name}
          value={symbol.value}
          isLed={symbol.isLed}
          isZener={symbol.isZener}
          pointingUp={symbol.pointingUp}
        />
      )
    case 'sourceV':
      return (
        <SourceV
          x={symbol.x}
          y1={symbol.y1}
          y2={symbol.y2}
          name={symbol.name}
          value={symbol.value}
          isAc={symbol.isAc}
        />
      )
    case 'opamp':
      return <Opamp cx={symbol.cx} inTopX={symbol.inTopX} inBotX={symbol.inBotX} outX={symbol.outX} />
    case 'bjt':
      return (
        <Bjt
          collectorX={symbol.collectorX}
          baseX={symbol.baseX}
          emitterX={symbol.emitterX}
          name={symbol.name}
          value={symbol.value}
        />
      )
    case 'wireH':
      return (
        <g>
          <line x1={symbol.x1} y1={symbol.y} x2={symbol.x2} y2={symbol.y} className={styles.wire} />
          {symbol.name && (
            <text x={(symbol.x1 + symbol.x2) / 2} y={symbol.y - 16} textAnchor="middle" className={styles.lbl}>
              {symbol.name} · {symbol.value}
            </text>
          )}
        </g>
      )
  }
}

export function NetlistDiagram({
  netlistText,
  title,
  showExplanation = true,
  workspaceSummary,
}: {
  netlistText: string
  title?: string
  showExplanation?: boolean
  workspaceSummary?: string | null
}) {
  const parsed = useMemo(() => {
    try {
      return { data: parseNetlist(netlistText), error: null as string | null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof NetlistParseError ? error.message : 'No se pudo leer el netlist.',
      }
    }
  }, [netlistText])

  if (parsed.error || !parsed.data) {
    return (
      <p role="alert" className={styles.parseError}>
        {parsed.error}
      </p>
    )
  }

  const netlist = parsed.data
  const diagram = buildDiagram(netlist)

  // Encontrar qué items de leyenda se usan
  const activeLegend = LEGEND_ITEMS.filter((item) =>
    diagram.usedSymbols.has(item.key as (typeof item)['key']),
  )

  return (
    <div className={styles.container}>
      {/* Card 1: Canvas Card */}
      <section aria-label="Lienzo esquemático del circuito" className={styles.canvasCard}>
        <div className={styles.head}>
          <h4>{title ?? netlist.title}</h4>
          <span className={styles.badge}>
            {Object.keys(diagram.nodeXs).length} nodos · {netlist.elements.length} componentes
          </span>
        </div>

        <div className={styles.canvasWrap}>
          <svg
            viewBox={`0 0 ${diagram.width} ${diagram.height}`}
            className={styles.svg}
            role="img"
            aria-label={`Diagrama del circuito ${netlist.title}`}
          >
            <defs>
              <pattern id="schematic-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#1c2433" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width={diagram.width} height={diagram.height} fill="url(#schematic-grid)" />

            {/* Raíles horizontales de señal por nodo (solo conectan ramas pertenecientes al mismo bus) */}
            {diagram.nodeBuses.map((bus) => {
              const hasMultiple = bus.branches.length > 1
              const midX = (bus.xStart + bus.xEnd) / 2
              return (
                <g key={bus.node}>
                  {hasMultiple ? (
                    <line
                      x1={bus.xStart}
                      y1={RAIL_Y}
                      x2={bus.xEnd}
                      y2={RAIL_Y}
                      className={styles.wire}
                    />
                  ) : null}

                  {bus.branches.map((bx, idx) => (
                    <circle key={idx} cx={bx} cy={RAIL_Y} r={3.2} className={styles.nodeDot} />
                  ))}

                  {bus.branches.length === 0 ? (
                    <circle cx={bus.xStart} cy={RAIL_Y} r={3.2} className={styles.nodeDot} />
                  ) : null}

                  <text
                    x={hasMultiple ? midX : bus.xStart}
                    y={RAIL_Y - 24}
                    textAnchor="middle"
                    className={styles.lblNode}
                  >
                    {bus.node}
                  </text>
                </g>
              )
            })}

            {/* Símbolos del circuito */}
            {diagram.symbols.map((symbol, index) => (
              <Symbol key={index} symbol={symbol} />
            ))}

            {/* Raíl de tierra horizontal continuo */}
            {diagram.groundDrops.length ? (
              <line
                x1={Math.min(...diagram.groundDrops) - 25}
                y1={GROUND_Y}
                x2={Math.max(...diagram.groundDrops) + 25}
                y2={GROUND_Y}
                className={styles.groundRail}
              />
            ) : null}

            {/* Símbolos de tierra */}
            {diagram.groundDrops.map((x, index) => (
              <Ground key={index} x={x} y={GROUND_Y} />
            ))}
          </svg>
        </div>

        {activeLegend.length > 0 && (
          <div className={styles.legend}>
            {activeLegend.map((item) => (
              <span key={item.key} className={styles.legendItem}>
                <span className={styles.legendIcon}>{item.symbol}</span>
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Card 2: Explanation Card */}
      {showExplanation && (
        <section aria-label="Descripción del circuito" className={styles.explainCard}>
          <h5 className={styles.explainTitle}>¿QUÉ HACE ESTE CIRCUITO?</h5>
          <p className={styles.explainText}>{workspaceSummary || describeCircuit(netlist)}</p>

          {netlist.measurements.length > 0 ? (
            <div className={styles.measureCallout}>
              <span className={styles.measurePrefix}>El sistema mide</span>
              <span className={styles.measureContent}>
                {measurementText(netlist.measurements)}
              </span>
            </div>
          ) : null}

          <table className={styles.componentTable}>
            <thead>
              <tr>
                <th>Componente</th>
                <th>Entre nodos</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {netlist.elements.map((e) => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td>{e.nodes.join(' → ')}</td>
                  <td>{componentValue(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {showExplanation && (
        <p className={styles.footnote}>
          Diagrama de conectividad generado a partir del texto SPICE real — no es un esquemático certificado con
          símbolos IEC/ANSI oficiales, ni mucho menos un layout de PCB (pistas, footprints, capas). Sirve para ver
          de un vistazo qué se conecta con qué.
        </p>
      )}
    </div>
  )
}
