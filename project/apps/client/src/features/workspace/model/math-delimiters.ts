const CODE_FENCE = /(```[\s\S]*?(?:```|$))/g

const displayBlock = (math: string) => `\n$$\n${math.trim()}\n$$\n`

// remark-math solo entiende `$…$` y `$$…$$` —y un `$$…$$` en una sola línea
// lo toma como fórmula en línea—, pero los modelos alternan con `\(…\)` y
// `\[…\]` y escriben las ecuaciones sueltas en una línea. Todo se lleva a la
// forma que remark-math reconoce, fuera de los bloques de código.
export function normalizeMathDelimiters(text: string): string {
  return text
    .split(CODE_FENCE)
    .map((part) =>
      part.startsWith('```')
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, math: string) => displayBlock(math))
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, math: string) => `$${math.trim()}$`)
            .replace(/^[ \t]*\$\$([^\n]+?)\$\$[ \t]*$/gm, (_, math: string) => displayBlock(math)),
    )
    .join('')
}
