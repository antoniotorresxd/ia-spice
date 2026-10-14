import 'katex/dist/katex.min.css'

import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { normalizeMathDelimiters } from '../model/math-delimiters'
import styles from './MarkdownText.module.css'

const remarkPlugins = [remarkGfm, remarkMath, remarkBreaks]
// throwOnError: false — una fórmula mal escrita por el LLM se muestra en rojo
// en vez de tumbar el mensaje entero.
const rehypePlugins: [typeof rehypeKatex, { throwOnError: boolean }][] = [[rehypeKatex, { throwOnError: false }]]

// Texto de los agentes: Markdown (GFM) con fórmulas LaTeX. react-markdown no
// interpreta HTML crudo, así que lo que escriba el LLM no puede inyectar marcado.
export function MarkdownText({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ? `${styles.markdown} ${className}` : styles.markdown}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {normalizeMathDelimiters(children)}
      </ReactMarkdown>
    </div>
  )
}
