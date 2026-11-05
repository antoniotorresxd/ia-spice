from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Supply and DC input for the operating-point setup
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in', 'Vin', circuit.gnd, 2.0)
# Reference divider: Vref = 2.5 V
circuit.R('ref_top', 'Vdd', 'Vref', 10e3)
circuit.R('ref_bottom', 'Vref', circuit.gnd, 10e3)
# Non-inverting input and positive-feedback network
circuit.R('in', 'Vin', 'Vplus', 10e3)
circuit.R('feedback', 'Vout', 'Vplus', 100e3)
# High-gain op-amp approximation: Eraw = gain * (Vplus - Vref)
circuit.VCVS('opamp', 'Eraw', circuit.gnd, 'Vplus', 'Vref', 1e5)
circuit.R('out', 'Eraw', 'Vout', 100)
# Output clamps. The diodes conduct when Vout goes beyond the rails
# by approximately one forward diode drop.
circuit.model('DCLAMP', 'D', IS=1e-14, N=1)
circuit.D('high', 'Vout', 'Vdd', model='DCLAMP')
circuit.D('low', circuit.gnd, 'Vout', model='DCLAMP')
simulator = circuit.simulator()
