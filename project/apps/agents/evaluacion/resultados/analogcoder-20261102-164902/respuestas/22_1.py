from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Non-Inverting Schmitt Trigger')
# 5 V supply and DC input for the initial operating point
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in', 'Vin', circuit.gnd, 0.5)
# Reference voltage: 2.5 V from a 5 V divider
circuit.R('1', 'Vdd', 'Vref', 10e3)
circuit.R('2', 'Vref', circuit.gnd, 10e3)
# Input and positive-feedback resistors
circuit.R('in', 'Vin', 'Vp', 100e3)
circuit.R('fb', 'Vout', 'Vp', 100e3)
# High-gain op-amp approximation: output is proportional to Vp - Vref
circuit.VCVS('A1', 'Vraw', circuit.gnd, 'Vp', 'Vref', 100)
# Output resistance and rail-clamp diodes
circuit.R('out', 'Vraw', 'Vout', 10e3)
circuit.model('clamp_diode', 'D', Is=1e-14, N=1)
circuit.D('hi', 'Vout', 'Vdd', model='clamp_diode')
circuit.D('lo', circuit.gnd, 'Vout', model='clamp_diode')
simulator = circuit.simulator()
