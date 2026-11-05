from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Wien Bridge Oscillator')
# Supply and mid-supply reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)
# Diode model used for gain stabilization and output clamping
circuit.model('limiter_diode', 'D', IS=1e-14, N=1)
# Wien bridge: equal R and C values set the oscillation frequency
circuit.C('1', 'Vout', 'WienSeries', 10e-9)
circuit.R('1', 'WienSeries', 'WienMid', 10e3)
circuit.R('2', 'WienMid', 'Vref', 10e3)
circuit.C('2', 'WienMid', 'Vref', 10e-9)
# Op-amp model: high-gain VCVS, followed by a small output resistance
circuit.VCVS('amp', 'AmpOut', circuit.gnd, 'WienMid', 'Nminus', 1e5)
circuit.R('out', 'AmpOut', 'Vout', 100)
# Inverting-input gain network
circuit.R('g', 'Nminus', 'Vref', 10e3)
circuit.R('base', 'Vout', 'Nbase', 19.6e3)
circuit.R('lim', 'Nbase', 'Nminus', 10e3)
# Antiparallel diodes across Rlim reduce gain at larger amplitudes
circuit.D('lim1', 'Nbase', 'Nminus', model='limiter_diode')
circuit.D('lim2', 'Nminus', 'Nbase', model='limiter_diode')
# Approximate output clamps to the supply rails
circuit.D('clamp_hi', 'Vout', 'Vdd', model='limiter_diode')
circuit.D('clamp_lo', circuit.gnd, 'Vout', model='limiter_diode')
simulator = circuit.simulator()
