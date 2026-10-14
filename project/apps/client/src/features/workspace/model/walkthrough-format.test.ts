import { describe, expect, it } from 'vitest'

import { structureWalkthrough } from './walkthrough-format'

describe('structureWalkthrough', () => {
  it('convierte las etiquetas sueltas en secciones numeradas (caso real ya guardado)', () => {
    const stored = [
      'Requisito: Se solicitó un amplificador de instrumentación con una ganancia diferencial de $A_v = 2.0$.',
      'Topología: Se utilizó la configuración clásica de tres amplificadores operacionales.',
      'Ecuaciones: La ganancia total se define como $A_v = 1 + \\frac{2R}{R_G}$.',
      'Simulación: El análisis midió una ganancia de 1.99992.',
    ].join('\n')

    expect(structureWalkthrough(stored)).toBe(
      [
        '## 1. Requisito',
        'Se solicitó un amplificador de instrumentación con una ganancia diferencial de $A_v = 2.0$.',
        '## 2. Topología',
        'Se utilizó la configuración clásica de tres amplificadores operacionales.',
        '## 3. Ecuaciones',
        'La ganancia total se define como $A_v = 1 + \\frac{2R}{R_G}$.',
        '## 4. Simulación',
        'El análisis midió una ganancia de 1.99992.',
      ].join('\n\n'),
    )
  })

  it('acepta etiquetas numeradas o en negritas y conserva las líneas de continuación', () => {
    const text = '1. **Requisito:** ganancia 2.\nsegunda línea\n**Valores**: $R = 10\\,k\\Omega$.'
    expect(structureWalkthrough(text)).toBe(
      '## 1. Requisito\n\nganancia 2.\nsegunda línea\n\n## 2. Valores\n\n$R = 10\\,k\\Omega$.',
    )
  })

  it('no toca un texto que ya trae títulos Markdown', () => {
    const text = '## 1. Requisito\n\nRequisito: ganancia 2.\n\n$$A_v = 2$$'
    expect(structureWalkthrough(text)).toBe(text)
  })

  it('no toca un texto sin etiquetas', () => {
    const text = 'Un solo párrafo.\nCon dos líneas.'
    expect(structureWalkthrough(text)).toBe(text)
  })

  it('no confunde una frase con fórmula y dos puntos con una etiqueta', () => {
    const text = 'Requisito: ganancia 2.\nPara $A_v = 2$: se despeja R_G.'
    expect(structureWalkthrough(text)).toBe('## 1. Requisito\n\nganancia 2.\nPara $A_v = 2$: se despeja R_G.')
  })
})
