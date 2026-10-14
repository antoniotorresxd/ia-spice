import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { normalizeMathDelimiters } from '../model/math-delimiters'
import { MarkdownText } from './MarkdownText'

afterEach(cleanup)

describe('MarkdownText', () => {
  it('renderiza negritas y listas en vez de mostrar los asteriscos', () => {
    const { container } = render(<MarkdownText>{'1. **Rama 1:**\n   - Suma en serie'}</MarkdownText>)

    expect(screen.getByText('Rama 1:').tagName).toBe('STRONG')
    expect(container.querySelector('ol li ul li')?.textContent).toBe('Suma en serie')
    expect(container.textContent).not.toContain('**')
  })

  it('renderiza las fórmulas en línea y en bloque con KaTeX', () => {
    const { container } = render(
      <MarkdownText>{'Paralelo: $R_{p1} = \\frac{50 \\times 200}{250}$\n\n$$R_{AB} = 40\\,\\Omega$$'}</MarkdownText>,
    )

    expect(container.querySelectorAll('.katex').length).toBe(2)
    expect(container.querySelector('.katex-display')).not.toBeNull()
    // El LaTeX fuente solo queda en la anotación MathML (accesibilidad), no en lo visible.
    const visible = [...container.querySelectorAll('.katex-html')].map((el) => el.textContent).join('')
    expect(visible).not.toContain('\\frac')
    expect(container.textContent).not.toContain('$')
  })

  it('respeta los saltos de línea simples del texto plano', () => {
    const { container } = render(<MarkdownText>{'Primera línea\nSegunda línea'}</MarkdownText>)

    expect(container.querySelector('p br')).not.toBeNull()
  })

  it('no inyecta HTML crudo que venga en el texto', () => {
    const { container } = render(<MarkdownText>{'<img src=x onerror="alert(1)"> hola'}</MarkdownText>)

    expect(container.querySelector('img')).toBeNull()
  })

  it('deja el informe en un bloque de código intacto', () => {
    const { container } = render(<MarkdownText>{'```text\n  Ecuaciones:\n    2*V(n1) - V(n2)*3 = 0\n```'}</MarkdownText>)

    expect(container.querySelector('pre code')?.textContent).toBe('  Ecuaciones:\n    2*V(n1) - V(n2)*3 = 0\n')
  })
})

describe('normalizeMathDelimiters', () => {
  it('convierte \\( \\) y \\[ \\] a los delimitadores con $', () => {
    expect(normalizeMathDelimiters('a \\(x^2\\) b \\[y\\]')).toBe('a $x^2$ b \n$$\ny\n$$\n')
  })

  it('no toca el contenido de los bloques de código', () => {
    const text = '```\n\\(x\\)\n```'
    expect(normalizeMathDelimiters(text)).toBe(text)
  })
})
