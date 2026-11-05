from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Wien Bridge Oscillator')
# 5 V supply and midpoint reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.R('ref_top', 'Vdd', 'Vref', 10e3)
circuit.R('ref_bottom', 'Vref', circuit.gnd, 10e3)
# Wien bridge: series RC from output to Vplus,
# and parallel RC from Vplus to the reference
circuit.R('wien_series', 'Vout', 'Wien_RC', 10e3)
circuit.C('wien_series', 'Wien_RC', 'Vplus', 10e-9)
circuit.R('wien_shunt', 'Vplus', 'Vref', 10e3)
circuit.C('wien_shunt', 'Vplus', 'Vref', 10e-9)
# Negative-feedback network; nominal small-signal gain = 1 + 21k/10k = 3.1
circuit.R('gain', 'Vout', 'Vminus', 21e3)
circuit.R('ground_gain', 'Vminus', 'Vref', 10e3)
# Antiparallel diodes provide nonlinear amplitude stabilization
circuit.model('Dlim', 'D', IS=1e-14, N=1)
circuit.D('limit_forward', 'Vout', 'Vminus', model='Dlim')
circuit.D('limit_reverse', 'Vminus', 'Vout', model='Dlim')
# Finite-gain amplifier model.
# The series offset source centers the output at Vref.
circuit.VCVS('amp', 'Aout', circuit.gnd, 'Vplus', 'Vminus', 1e5)
circuit.V('output_offset', 'Vout', 'Aout', 2.5)
simulator = circuit.simulator()
