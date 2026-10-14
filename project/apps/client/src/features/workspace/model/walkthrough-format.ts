// "Requisito: ...", "**Ecuaciones:** ...", "4. Valores: ...": una etiqueta
// corta al inicio de línea, sin fórmulas, seguida de dos puntos.
const LABEL = /^\s*(?:\d+[.)]\s*)?(?:\*\*)?([A-ZÁÉÍÓÚÑ][\wáéíóúñü ]{2,40}?)(?:\*\*:|:\*\*|:)\s*(.*)$/u

// La memoria de diseño debería traer secciones `##`, pero el modelo a veces
// responde con párrafos "Requisito: ...", "Ecuaciones: ..." que, unidos por
// saltos simples, se leen como un bloque corrido. Las etiquetas pasan a ser
// secciones numeradas; un texto que ya trae títulos Markdown queda igual.
// Es el mismo criterio que agents aplica al generarla
// (`documentador/node.py`, `estructurar_paso_a_paso`); aquí cubre las
// memorias ya guardadas antes de ese arreglo.
export function structureWalkthrough(text: string): string {
  const lines = text.trim().split('\n')
  if (lines.some((line) => line.trimStart().startsWith('#'))) return text

  const preface: string[] = []
  const sections: { title: string; body: string[] }[] = []
  for (const line of lines) {
    const match = LABEL.exec(line)
    if (match) {
      sections.push({ title: match[1].trim(), body: match[2] ? [match[2]] : [] })
    } else if (sections.length) {
      sections[sections.length - 1].body.push(line)
    } else {
      preface.push(line)
    }
  }
  if (!sections.length) return text

  const parts = preface.some((line) => line.trim()) ? [preface.join('\n').trim()] : []
  sections.forEach(({ title, body }, index) => {
    const content = body.join('\n').trim()
    parts.push(`## ${index + 1}. ${title}` + (content ? `\n\n${content}` : ''))
  })
  return parts.join('\n\n')
}
