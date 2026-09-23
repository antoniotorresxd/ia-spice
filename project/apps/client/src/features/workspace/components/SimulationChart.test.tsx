import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SimulationChart } from './SimulationChart'

describe('SimulationChart', () => {
  it('renders empty state when no curve points are provided', () => {
    render(<SimulationChart curve={[]} />)
    expect(
      screen.getByText(/No hay datos vectoriales de simulación SPICE disponibles/i),
    ).toBeInTheDocument()
  })

  it('renders AC frequency response curve with title and metrics', () => {
    const mockCurve = [
      { x: 10, y: 0 },
      { x: 100, y: -0.1 },
      { x: 1000, y: -3.01 },
      { x: 10000, y: -20 },
      { x: 100000, y: -40 },
    ]

    render(
      <SimulationChart
        curve={mockCurve}
        analysisType="ac"
        xUnit="Hz"
        yUnit="dB"
        metricName="Frecuencia de corte"
        measuredValue={1000}
        targetValue={1050}
        title="Filtro Pasa-Bajos"
      />,
    )

    expect(screen.getByText('Filtro Pasa-Bajos')).toBeInTheDocument()
    expect(screen.getByText(/Bode \(Magnitud AC\)/i)).toBeInTheDocument()
    expect(screen.getByText('5 pts ngspice')).toBeInTheDocument()
    expect(screen.getByText('Frecuencia de corte:')).toBeInTheDocument()
    expect(screen.getAllByText('1 kHz').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('(obj: 1.1 kHz)')).toBeInTheDocument()
  })

  it('renders transient time waveform curve', () => {
    const mockCurve = [
      { x: 0, y: 0 },
      { x: 0.001, y: 3.3 },
      { x: 0.002, y: 5.0 },
      { x: 0.003, y: 2.1 },
    ]

    render(
      <SimulationChart
        curve={mockCurve}
        analysisType="tran"
        xUnit="s"
        yUnit="V"
        metricName="Voltaje Pico"
        measuredValue={5.0}
        title="Respuesta al Escalón"
      />,
    )

    expect(screen.getByText('Respuesta al Escalón')).toBeInTheDocument()
    expect(screen.getByText(/Transitorio \(Onda\)/i)).toBeInTheDocument()
    expect(screen.getByText('4 pts ngspice')).toBeInTheDocument()
    expect(screen.getByText('Voltaje Pico:')).toBeInTheDocument()
  })
})
