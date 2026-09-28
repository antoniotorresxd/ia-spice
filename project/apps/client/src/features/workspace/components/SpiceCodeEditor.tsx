import { Check, Copy, Download, FileCode2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import styles from './SpiceCodeEditor.module.css'

export type SpiceCodeEditorProps = {
  code: string
  fileName?: string
}

/**
 * Tokenizador y coloreador de sintaxis para líneas de Netlist SPICE.
 */
function highlightSpiceLine(line: string, lineIndex: number) {
  const trimmed = line.trim()

  // Comentario SPICE (* comentario)
  if (trimmed.startsWith('*')) {
    return (
      <span key={lineIndex} className={styles.codeLine}>
        <span className={styles.tokenComment}>{line || ' '}</span>
      </span>
    )
  }

  // Directiva de control (.model, .control, .end, .param, etc.)
  if (trimmed.startsWith('.')) {
    const parts = line.split(/(\s+)/)
    return (
      <span key={lineIndex} className={styles.codeLine}>
        {parts.map((part, i) => {
          if (part.startsWith('.')) {
            return (
              <span key={i} className={styles.tokenDirective}>
                {part}
              </span>
            )
          }
          if (/^\d+(\.\d+)?[a-zA-Z]*$/.test(part)) {
            return (
              <span key={i} className={styles.tokenNumber}>
                {part}
              </span>
            )
          }
          return (
            <span key={i} className={styles.tokenIdentifier}>
              {part}
            </span>
          )
        })}
      </span>
    )
  }

  // Declaración de componente o instrucción
  const tokens = line.split(/(\s+)/)
  let nonSpaceCount = 0

  return (
    <span key={lineIndex} className={styles.codeLine}>
      {tokens.map((tok, i) => {
        if (/^\s+$/.test(tok) || tok === '') {
          return <span key={i}>{tok}</span>
        }
        const tokenIndex = nonSpaceCount++
        if (tokenIndex === 0) {
          // Identificador de componente (Vdc, RZ, DZ, RL...)
          return (
            <span key={i} className={styles.tokenComponent}>
              {tok}
            </span>
          )
        }
        if (tok === '0' || tok.toLowerCase() === 'gnd') {
          // Tierra del circuito
          return (
            <span key={i} className={styles.tokenGround}>
              {tok}
            </span>
          )
        }
        if (/^\d+(\.\d+)?[fpnumkKMGT]?$/i.test(tok) || /^\d+(\.\d+)?(meg|mil)?$/i.test(tok)) {
          // Valor numérico con prefijo de ingeniería SPICE
          return (
            <span key={i} className={styles.tokenNumber}>
              {tok}
            </span>
          )
        }
        if (['DC', 'AC', 'SIN', 'PULSE', 'EXP', 'SFFM'].includes(tok.toUpperCase())) {
          // Modos de excitación
          return (
            <span key={i} className={styles.tokenKeyword}>
              {tok}
            </span>
          )
        }
        // Nombres de nodos o nombres de modelo
        return (
          <span key={i} className={styles.tokenNode}>
            {tok}
          </span>
        )
      })}
    </span>
  )
}

export function SpiceCodeEditor({
  code,
  fileName = 'circuito.cir',
}: SpiceCodeEditorProps) {
  const [copied, setCopied] = useState(false)

  const lines = useMemo(() => code.split('\n'), [code])

  // Contar componentes (líneas que no son comentarios ni directivas ni vacías)
  const componentCount = useMemo(() => {
    return lines.filter((l) => {
      const t = l.trim()
      return t && !t.startsWith('*') && !t.startsWith('.')
    }).length
  }, [lines])

  const handleCopy = () => {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.endsWith('.cir') ? fileName : `${fileName}.cir`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.editorWrapper} role="region" aria-label="Visor de código Netlist SPICE">
      {/* Barra de título estilo VS Code */}
      <div className={styles.editorTitlebar}>
        <div className={styles.titlebarLeft}>
          <div className={styles.windowDots} aria-hidden="true">
            <span className={`${styles.dot} ${styles.dotRed}`} />
            <span className={`${styles.dot} ${styles.dotYellow}`} />
            <span className={`${styles.dot} ${styles.dotGreen}`} />
          </div>

          <div className={styles.fileTab}>
            <FileCode2 size={14} className={styles.fileIcon} />
            <span>{fileName}</span>
            <span className={styles.fileBadge}>SPICE .cir</span>
          </div>
        </div>

        <div className={styles.titlebarRight}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleCopy}
            title="Copiar código Netlist al portapapeles"
          >
            {copied ? <Check size={12} style={{ color: '#3fb950' }} /> : <Copy size={12} />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>

          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleDownload}
            title="Descargar archivo netlist (.cir)"
          >
            <Download size={12} />
            <span>Descargar</span>
          </button>
        </div>
      </div>

      {/* Cuerpo del Visor: Gutter con números de línea + Código Coloreado */}
      <div className={styles.codeArea}>
        <div className={styles.gutter} aria-hidden="true">
          {lines.map((_, i) => (
            <span key={i} className={styles.lineNumber}>
              {i + 1}
            </span>
          ))}
        </div>

        <pre className={styles.highlightedCode}>
          <code>
            {lines.map((line, idx) => highlightSpiceLine(line, idx))}
          </code>
        </pre>
      </div>

      {/* Barra de estado inferior estilo IDE */}
      <div className={styles.editorStatusbar}>
        <div className={styles.statusbarLeft}>
          <div className={styles.statusbarItem}>
            <span className={styles.statusbarDot} />
            <span>SPICE Netlist</span>
          </div>
          <div className={styles.statusbarItem}>
            <span>{lines.length} líneas</span>
          </div>
          <div className={styles.statusbarItem}>
            <span>{componentCount} componentes</span>
          </div>
        </div>
        <div className={styles.statusbarRight}>
          <span className={styles.readOnlyBadge}>Solo lectura</span>
          <span>UTF-8</span>
          <span>ngspice</span>
        </div>
      </div>
    </div>
  )
}
