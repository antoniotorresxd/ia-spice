from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Wien Bridge Oscillator')
# Supply and mid-supply reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)
# Diode model for amplitude stabilization
circuit.model('dlim', 'D', is_=1e-14, n=1.0)
# Wien bridge: series RC from output to non-inverting input,
# parallel RC from non-inverting input to the reference
circuit.C('w1', 'Vout', 'Nw', 10e-9)
circuit.R('w1', 'Nw', 'Wp', 10e3)
circuit.R('w2', 'Wp', 'Vref', 10e3)
circuit.C('w2', 'Wp', 'Vref', 10e-9)
# Op-amp represented by a high-gain VCVS.
# Its output is referenced to Vref, centering the signal at mid-supply.
circuit.VCVS('A1', 'Vout', 'Vref', 'Wp', 'Wm', voltage_gain=1e5)
# Non-inverting amplifier feedback network
circuit.R('fb1', 'Vout', 'Nfb', 10e3)
circuit.R('fb2', 'Nfb', 'Wm', 12e3)
circuit.R('g', 'Wm', 'Vref', 10e3)
# Antiparallel limiter diodes across Rfb2
circuit.D('lim1', 'Nfb', 'Wm', model='dlim')
circuit.D('lim2', 'Wm', 'Nfb', model='dlim')
simulator = circuit.simulator()
