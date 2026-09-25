import { Maximize2, Move, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  COL_ROUTE_Y,
  EMI_Y,
  GROUND_Y,
  type LayoutSymbol,
  NetlistParseError,
  OPAMP_INP_Y,
  OPAMP_INN_Y,
  type ParsedNetlist,
  RAIL_Y,
  VCC_Y,
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

function DropLegs({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  if (y === RAIL_Y) return null
  return (
    <g>
      <line x1={x1} y1={RAIL_Y} x2={x1} y2={y} className={styles.wire} />
      <line x1={x2} y1={y} x2={x2} y2={RAIL_Y} className={styles.wire} />
      <circle cx={x1} cy={RAIL_Y} r={3} className={styles.nodeDot} />
      <circle cx={x2} cy={RAIL_Y} r={3} className={styles.nodeDot} />
    </g>
  )
}

function ResistorH({ x1, x2, y, name, value }: { x1: number; x2: number; y: number; name: string; value: string }) {
  const mx = (x1 + x2) / 2
  return (
    <g>
      <DropLegs x1={x1} x2={x2} y={y} />
      <ResistorZigzag x1={x1} x2={x2} y={y} />
      <text x={mx} y={y - 18} textAnchor="middle" className={styles.lbl}>
        {name} · {value}
      </text>
    </g>
  )
}

function ResistorV({ x, y1, y2, name, value }: { x: number; y1: number; y2: number; name: string; value: string }) {
  // Fixed-size body, centered — wires extend to the rails
  const segs = 6
  const amp = 10
  const segH = 9
  const bodyH = segs * segH          // ~54 px
  const my = (y1 + y2) / 2
  const zy1 = my - bodyH / 2
  const zy2 = my + bodyH / 2
  const step = segH
  const points: string[] = [`${x},${zy1}`]
  for (let i = 1; i < segs; i++) points.push(`${x + (i % 2 ? -amp : amp)},${zy1 + i * step}`)
  points.push(`${x},${zy2}`)
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
      <DropLegs x1={x1} x2={x2} y={y} />
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
      <DropLegs x1={x1} x2={x2} y={y} />
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
  // Fixed-size body, centered — wires extend to the rails
  const loops = 4
  const loopH = 17           // px per loop
  const bodyH = loops * loopH  // ~68 px
  const my = (y1 + y2) / 2
  const ly1 = my - bodyH / 2
  const ly2 = my + bodyH / 2
  const r = loopH / 2
  const paths: string[] = []
  for (let i = 0; i < loops; i++) {
    const start = ly1 + i * loopH
    const end = start + loopH
    paths.push(`M ${x} ${start} A ${r * 1.2} ${r} 0 0 1 ${x} ${end}`)
  }
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={ly1} className={styles.wire} />
      <line x1={x} y1={ly2} x2={x} y2={y2} className={styles.wire} />
      {paths.map((p, idx) => (
        <path key={idx} d={p} className={styles.symbolStroke} fill="none" />
      ))}
      <text x={x + 22} y={my - 2} textAnchor="start" className={styles.lbl}>
        {name}
      </text>
      <text x={x + 22} y={my + 13} textAnchor="start" className={styles.lblSub}>
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
      <DropLegs x1={x1} x2={x2} y={y} />
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

function SourceH({
  x1,
  x2,
  y,
  name,
  value,
  isAc,
}: {
  x1: number
  x2: number
  y: number
  name: string
  value: string
  isAc: boolean
}) {
  const mx = (x1 + x2) / 2
  const r = 17
  return (
    <g>
      <DropLegs x1={x1} x2={x2} y={y} />
      <line x1={x1} y1={y} x2={mx - r} y2={y} className={styles.wire} />
      <line x1={mx + r} y1={y} x2={x2} y2={y} className={styles.wire} />
      <circle cx={mx} cy={y} r={r} className={styles.symbolStroke} fill="none" />
      {isAc ? (
        <path d={`M ${mx - 9} ${y} q 4.5 -8 9 0 q 4.5 8 9 0`} className={styles.symbolStroke} fill="none" />
      ) : (
        <>
          <line x1={mx - 6} y1={y - 7} x2={mx + 6} y2={y - 7} className={styles.symbolStroke} />
          <line x1={mx} y1={y - 12} x2={mx} y2={y - 2} className={styles.symbolStroke} />
          <line x1={mx - 6} y1={y + 7} x2={mx + 6} y2={y + 7} className={styles.symbolStroke} />
        </>
      )}
      <text x={mx} y={y - 22} textAnchor="middle" className={styles.lbl}>
        {name} · {value}
      </text>
    </g>
  )
}

function WireHopH({ x1, x2, y, hopX }: { x1: number; x2: number; y: number; hopX: number }) {
  const r = 10
  return (
    <g>
      <line x1={x1} y1={y} x2={hopX - r} y2={y} className={styles.wire} />
      {/* Máscara de fondo bajo el arco para asegurar que ningún trazo posterior se cruce */}
      <rect
        x={hopX - r}
        y={y - r - 2}
        width={r * 2}
        height={r + 4}
        fill="#090d13"
      />
      <path
        d={`M ${hopX - r},${y} A ${r},${r} 0 0,1 ${hopX + r},${y}`}
        className={styles.wire}
        fill="none"
        strokeWidth={1.8}
      />
      <line x1={hopX + r} y1={y} x2={x2} y2={y} className={styles.wire} />
    </g>
  )
}

function Opamp({
  cx,
  left: propLeft,
  right: propRight,
  inTopX,
  inBotX,
  outX,
  name = 'U1',
  value = 'opamp',
  inpIsGround = false,
  innIsGround = false,
  isBuffer = false,
}: {
  cx: number
  left?: number
  right?: number
  inTopX: number
  inBotX: number
  outX: number
  name?: string
  value?: string
  inpIsGround?: boolean
  innIsGround?: boolean
  isBuffer?: boolean
}) {
  const w = 64
  const h = 56
  const left = propLeft ?? cx - w / 2
  const right = propRight ?? cx + w / 2
  const top = RAIL_Y - h / 2
  const bot = RAIL_Y + h / 2
  const topPinY = OPAMP_INP_Y
  const botPinY = OPAMP_INN_Y
  const stepX = Math.min(inTopX + 20, left - 14)

  return (
    <g>
      {/* Cuerpo triangular del amplificador operacional */}
      <polygon
        points={`${left},${top} ${left},${bot} ${right},${RAIL_Y}`}
        className={styles.symbolStroke}
        fill="none"
      />
      {/* Signos + (no inversor) y - (inversor) */}
      <text x={left + 9} y={topPinY + 5} textAnchor="start" className={styles.lblSign}>
        +
      </text>
      <text x={left + 9} y={botPinY + 5} textAnchor="start" className={styles.lblSign}>
        −
      </text>

      {/* Entrada superior (+): enrutamiento ortogonal Manhattan sin diagonales */}
      {inpIsGround ? (
        <g>
          <line x1={left - 16} y1={topPinY} x2={left} y2={topPinY} className={styles.wire} />
          <line x1={left - 16} y1={topPinY} x2={left - 16} y2={topPinY + 14} className={styles.wire} />
          <line x1={left - 22} y1={topPinY + 14} x2={left - 10} y2={topPinY + 14} className={styles.symbolStroke} />
          <line x1={left - 19} y1={topPinY + 18} x2={left - 13} y2={topPinY + 18} className={styles.symbolStroke} />
          <line x1={left - 17} y1={topPinY + 22} x2={left - 15} y2={topPinY + 22} className={styles.symbolStroke} />
        </g>
      ) : (
        <polyline
          points={`${inTopX},${RAIL_Y} ${stepX},${RAIL_Y} ${stepX},${topPinY} ${left},${topPinY}`}
          className={styles.wire}
          fill="none"
        />
      )}

      {/* Entrada inferior (-): enrutamiento horizontal limpio al pin inversor */}
      {isBuffer ? (
        <polyline
          points={`${right},${RAIL_Y} ${right + 16},${RAIL_Y} ${right + 16},${botPinY + 16} ${left - 12},${botPinY + 16} ${left - 12},${botPinY} ${left},${botPinY}`}
          className={styles.wire}
          fill="none"
        />
      ) : innIsGround ? (
        <g>
          <line x1={left - 16} y1={botPinY} x2={left} y2={botPinY} className={styles.wire} />
          <line x1={left - 16} y1={botPinY} x2={left - 16} y2={botPinY + 14} className={styles.wire} />
          <line x1={left - 22} y1={botPinY + 14} x2={left - 10} y2={botPinY + 14} className={styles.symbolStroke} />
          <line x1={left - 19} y1={botPinY + 18} x2={left - 13} y2={botPinY + 18} className={styles.symbolStroke} />
          <line x1={left - 17} y1={botPinY + 22} x2={left - 15} y2={botPinY + 22} className={styles.symbolStroke} />
        </g>
      ) : inBotX < left ? (
        <line x1={inBotX} y1={botPinY} x2={left} y2={botPinY} className={styles.wire} />
      ) : (
        <line x1={left - 16} y1={botPinY} x2={left} y2={botPinY} className={styles.wire} />
      )}

      {/* Salida: tramo horizontal desde la punta del triángulo hacia outX */}
      <line x1={right} y1={RAIL_Y} x2={outX} y2={RAIL_Y} className={styles.wire} />

      {/* Etiqueta identificadora del componente */}
      <text x={cx} y={top - 20} textAnchor="middle" className={styles.lblSub}>
        {name} · {value}
      </text>
    </g>
  )
}

function Bjt({
  cx,
  collectorX,
  baseX,
  emitterX,
  name,
  value,
}: {
  cx: number
  collectorX: number
  baseX: number
  emitterX: number
  name: string
  value: string
}) {
  const bodyX = cx - 10
  const spineTop = RAIL_Y - 26
  const spineBot = RAIL_Y + 26
  const colTermX = bodyX + 20
  const colTermY = spineTop - 8
  const emiTermX = bodyX + 20
  const emiTermY = spineBot + 8

  return (
    <g>
      {/* Pin de Base */}
      <line x1={baseX} y1={RAIL_Y} x2={bodyX} y2={RAIL_Y} className={styles.wire} />
      <circle cx={baseX} cy={RAIL_Y} r={3} className={styles.nodeDot} />

      {/* Espina del transistor */}
      <line x1={bodyX} y1={spineTop} x2={bodyX} y2={spineBot} className={styles.symbolStroke} />
      <line x1={bodyX} y1={spineTop + 6} x2={colTermX} y2={colTermY} className={styles.symbolStroke} />

      {/* Enrutamiento colector hacia collectorX por la pista aérea COL_ROUTE_Y (sin tocar el texto del transistor) */}
      <polyline
        points={`${colTermX},${colTermY} ${colTermX},${COL_ROUTE_Y} ${collectorX},${COL_ROUTE_Y} ${collectorX},${RAIL_Y}`}
        className={styles.wire}
        fill="none"
      />
      <circle cx={collectorX} cy={RAIL_Y} r={3} className={styles.nodeDot} />

      {/* Terminal emisor y flecha NPN */}
      <line x1={bodyX} y1={spineBot - 6} x2={emiTermX} y2={emiTermY} className={styles.symbolStroke} />
      <polygon
        points={`${bodyX + 11},${spineBot - 1} ${bodyX + 21},${spineBot + 3} ${bodyX + 13},${spineBot + 9}`}
        className={styles.symbolStroke}
      />

      {/* Enrutamiento emisor hacia emitterX en su capa EMI_Y */}
      <polyline
        points={`${emiTermX},${emiTermY} ${emiTermX},${EMI_Y} ${emitterX},${EMI_Y}`}
        className={styles.wire}
        fill="none"
      />
      <circle cx={emitterX} cy={EMI_Y} r={3} className={styles.nodeDot} />

      {/* Cuerpo circular del BJT */}
      <circle cx={cx} cy={RAIL_Y} r={26} className={styles.symbolStroke} fill="none" />
      <text x={cx} y={RAIL_Y - 34} textAnchor="middle" className={styles.lblSub}>
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
    case 'sourceH':
      return (
        <SourceH
          x1={symbol.x1}
          x2={symbol.x2}
          y={symbol.y}
          name={symbol.name}
          value={symbol.value}
          isAc={symbol.isAc}
        />
      )
    case 'opamp':
      return (
        <Opamp
          cx={symbol.cx}
          left={symbol.left}
          right={symbol.right}
          inTopX={symbol.inTopX}
          inBotX={symbol.inBotX}
          outX={symbol.outX}
          name={symbol.name}
          value={symbol.value}
          inpIsGround={symbol.inpIsGround}
          innIsGround={symbol.innIsGround}
          isBuffer={symbol.isBuffer}
        />
      )
    case 'bjt':
      return (
        <Bjt
          cx={symbol.cx}
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
    case 'wireV':
      return <line x1={symbol.x} y1={symbol.y1} x2={symbol.x} y2={symbol.y2} className={styles.wire} />
    case 'wireHopH':
      return <WireHopH x1={symbol.x1} x2={symbol.x2} y={symbol.y} hopX={symbol.hopX} />
    case 'nodeDot':
      return <circle cx={symbol.x} cy={symbol.y} r={3.2} className={styles.nodeDot} />
  }
}

export function CircuitExplanation({
  netlist,
  workspaceSummary,
  compact = false,
}: {
  netlist: ParsedNetlist
  workspaceSummary?: string | null
  compact?: boolean
}) {
  return (
    <section aria-label="Descripción del circuito" className={`${styles.explainCard} ${compact ? styles.compactExplain : ''}`}>
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

      <div className={styles.tableScrollWrap}>
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
      </div>
    </section>
  )
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

  const netlist = parsed.data
  const diagram = useMemo(() => (netlist ? buildDiagram(netlist) : null), [netlist])

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 30, y: 30 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const autoCenteredRef = useRef(false)

  // Auto-centrar el diagrama en el lienzo
  const centerDiagram = useCallback(() => {
    const el = canvasWrapRef.current
    if (!el || !diagram) {
      setZoom(1)
      setPan({ x: 30, y: 30 })
      return
    }
    const rect = el.getBoundingClientRect()
    const fitScale = Math.min(
      (rect.width - 60) / diagram.width,
      (rect.height - 60) / diagram.height,
      1.0,
    )
    const initialZoom = Math.max(0.45, Number(fitScale.toFixed(2)))
    const initialPanX = Math.round((rect.width - diagram.width * initialZoom) / 2)
    const initialPanY = Math.round((rect.height - diagram.height * initialZoom) / 2)
    setZoom(initialZoom)
    setPan({ x: initialPanX, y: initialPanY })
  }, [diagram])

  // Centrar automáticamente cuando el diagrama esté disponible
  useEffect(() => {
    if (autoCenteredRef.current || !diagram) return
    autoCenteredRef.current = true
    const timer = setTimeout(centerDiagram, 40)
    return () => clearTimeout(timer)
  }, [diagram, centerDiagram])

  // Manejo de zoom por rueda con anclaje al puntero (focal zoom) y prevención estricta de zoom del navegador
  useEffect(() => {
    const el = canvasWrapRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88

      setZoom((currentZoom) => {
        const nextZoom = Math.min(Math.max(0.35, Number((currentZoom * zoomFactor).toFixed(2))), 3.5)
        if (nextZoom === currentZoom) return currentZoom

        setPan((currentPan) => {
          const scaleChange = nextZoom / currentZoom
          const nextPanX = mouseX - (mouseX - currentPan.x) * scaleChange
          const nextPanY = mouseY - (mouseY - currentPan.y) * scaleChange
          return { x: Math.round(nextPanX), y: Math.round(nextPanY) }
        })

        return nextZoom
      })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel)
    }
  }, [diagram])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag on primary button
    if (e.button !== 0) return
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Pointer capture release safety
      }
    }
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3.5, Number((prev + 0.15).toFixed(2))))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.35, Number((prev - 0.15).toFixed(2))))
  }

  const handleReset = () => {
    centerDiagram()
  }

  if (parsed.error || !netlist || !diagram) {
    return (
      <p role="alert" className={styles.parseError}>
        {parsed.error}
      </p>
    )
  }

  // Encontrar qué items de leyenda se usan
  const activeLegend = LEGEND_ITEMS.filter((item) =>
    diagram.usedSymbols.has(item.key as (typeof item)['key']),
  )

  return (
    <div className={styles.container}>
      {/* Card 1: Canvas Card */}
      <section aria-label="Lienzo esquemático del circuito" className={styles.canvasCard}>
        <div className={styles.head}>
          <div className={styles.titleInfo}>
            <h4>{title ?? netlist.title}</h4>
            <span className={styles.badge}>
              {Object.keys(diagram.nodeXs).length} nodos · {netlist.elements.length} componentes
            </span>
          </div>

          <div className={styles.canvasControls} role="toolbar" aria-label="Controles del lienzo">
            <button
              type="button"
              className={styles.canvasControlBtn}
              onClick={handleZoomOut}
              title="Alejar (-)"
              aria-label="Alejar"
            >
              <ZoomOut size={15} />
            </button>
            <span className={styles.zoomIndicator}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className={styles.canvasControlBtn}
              onClick={handleZoomIn}
              title="Acercar (+)"
              aria-label="Acercar"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              className={`${styles.canvasControlBtn} ${styles.resetBtn}`}
              onClick={handleReset}
              title="Restablecer vista"
              aria-label="Restablecer vista"
            >
              <Maximize2 size={14} />
              <span>100%</span>
            </button>
          </div>
        </div>

        <div
          ref={canvasWrapRef}
          className={`${styles.canvasWrap} ${isDragging ? styles.canvasWrapDragging : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <svg
            className={styles.svg}
            shapeRendering="geometricPrecision"
            textRendering="geometricPrecision"
            role="img"
            aria-label={`Diagrama del circuito ${netlist.title}`}
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Raíl de alimentación continuo superior (VCC) */}
              {diagram.topRailSpan && (
                <g>
                  <line
                    x1={diagram.topRailSpan.xStart - 18}
                    y1={VCC_Y}
                    x2={diagram.topRailSpan.xEnd + 18}
                    y2={VCC_Y}
                    className={styles.wire}
                    strokeWidth={2}
                  />
                  {diagram.topRailSpan.drops.map((x, idx) => (
                    <circle key={idx} cx={x} cy={VCC_Y} r={3.2} className={styles.nodeDot} />
                  ))}
                  <text
                    x={diagram.topRailSpan.xStart - 24}
                    y={VCC_Y + 4}
                    textAnchor="end"
                    className={styles.lblNode}
                    fontWeight="bold"
                  >
                    {diagram.topRailSpan.label}
                  </text>
                </g>
              )}

              {/* Raíles horizontales de señal por nodo (solo conectan ramas pertenecientes al mismo bus) */}
              {diagram.nodeBuses.map((bus) => {
                const busY = bus.y ?? RAIL_Y
                const hasMultiple = bus.branches.length > 1
                const midX = (bus.xStart + bus.xEnd) / 2
                return (
                  <g key={bus.node}>
                    {hasMultiple ? (
                      <line
                        x1={bus.xStart}
                        y1={busY}
                        x2={bus.xEnd}
                        y2={busY}
                        className={styles.wire}
                      />
                    ) : null}

                    {bus.branches.map((bx, idx) => (
                      <circle key={idx} cx={bx} cy={busY} r={3.2} className={styles.nodeDot} />
                    ))}

                    {bus.branches.length === 0 ? (
                      <circle cx={bus.xStart} cy={busY} r={3.2} className={styles.nodeDot} />
                    ) : null}

                    {/* Etiqueta de nodo posicionada limpia a la izquierda del nodo para no tapar pistas verticales */}
                    <text
                      x={hasMultiple ? midX : bus.xStart - 10}
                      y={hasMultiple ? busY - 14 : busY - 10}
                      textAnchor={hasMultiple ? 'middle' : 'end'}
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
            </g>
          </svg>

          <div className={styles.panHint}>
            <Move size={12} />
            <span>Arrastra para mover el lienzo · Rueda para zoom</span>
          </div>
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
        <CircuitExplanation netlist={netlist} workspaceSummary={workspaceSummary} />
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
