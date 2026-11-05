from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Supply and DC input/reference sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)
circuit.V('in', 'Vin', circuit.gnd, 3.0)
# Non-inverting input summing node:
# Vin is coupled through Rin and Vout provides positive feedback through Rf.
circuit.R('in', 'Vin', 'Vp', 100e3)
circuit.R('fb', 'Vout', 'Vp', 1e6)
# The inverting input is held at the switching reference.
# High-gain op-amp approximation: V(OA_RAW) = 1000 * (V(Vp) - V(Vref)).
circuit.VCVS('oa', 'OA_RAW', circuit.gnd, 'Vp', 'Vref', 1000)
# Output resistance and diode clamps model a single-supply op-amp output.
circuit.R('out', 'OA_RAW', 'Vout', 100e3)
circuit.model('DCLAMP', 'D', IS=1e-14, N=1)
circuit.D('low', circuit.gnd, 'Vout', model='DCLAMP')
circuit.D('high', 'Vout', 'Vdd', model='DCLAMP')
simulator = circuit.simulator()
