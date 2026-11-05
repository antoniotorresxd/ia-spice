from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Non-inverting Schmitt Trigger')
# Supply and DC input. Vin is set below the lower threshold to select
# the low-output state for the operating point.
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in', 'Vin', circuit.gnd, 2.0)
# 2.5 V reference for the inverting input
circuit.R('ref_top', 'Vdd', 'Vm', 10e3)
circuit.R('ref_bottom', 'Vm', circuit.gnd, 10e3)
# Non-inverting input and positive-feedback network
circuit.R('in', 'Vin', 'Vp', 10e3)
circuit.R('feedback', 'Vout', 'Vp', 100e3)
# High-gain op-amp model: output = gain * (Vp - Vm)
circuit.VCVS('opamp', 'Aout', circuit.gnd, 'Vp', 'Vm', 1e5)
# Series output resistance
circuit.R('out', 'Aout', 'Vout', 1e3)
# Diode clamps for a practical, supply-limited output
circuit.model('DCLAMP', 'D', IS=1e-14, N=1)
circuit.D('high', 'Vout', 'Vdd', model='DCLAMP')
circuit.D('low', circuit.gnd, 'Vout', model='DCLAMP')
simulator = circuit.simulator()
