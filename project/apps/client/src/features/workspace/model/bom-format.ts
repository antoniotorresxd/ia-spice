const UNIDADES: Record<string, string> = { ohm: 'Ω', F: 'F', H: 'H' }

const PREFIJOS: Array<[number, string]> = [
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
]

// Notación de ingeniería: 33 kΩ, 4.7 µF. Sin "m" para ohmios, que se
// confunde con mega (0.5 Ω, no 500 mΩ).
export function formatValue(value: number, unit = ''): string {
  const symbol = UNIDADES[unit] ?? unit
  if (value === 0) return `0 ${symbol}`
  if (unit === 'ohm' && Math.abs(value) < 1) return `${Number(value.toPrecision(3))} ${symbol}`
  for (const [scale, prefix] of PREFIJOS) {
    if (Math.abs(value) >= scale * 0.9999) {
      return `${Number((value / scale).toPrecision(3))} ${prefix}${symbol}`
    }
  }
  return `${Number(value.toPrecision(3))} ${symbol}`
}
