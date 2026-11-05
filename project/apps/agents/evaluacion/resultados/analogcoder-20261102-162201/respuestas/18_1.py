from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Opamp Integrator')
# Supply and DC input for operating-point setup
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in', 'Vin', circuit.gnd, 0.0)
# Op-amp: high-gain VCVS, output = A * (Vp - Vn)
circuit.VCVS('Aop', 'Vout', circuit.gnd, 'Vp', 'Vn', 1e5)
# Non-inverting input reference
circuit.R('ref', 'Vp', circuit.gnd, 1e6)
# Inverting integrator network
circuit.R('1', 'Vin', 'Vn', 100e3)
circuit.C('f', 'Vout', 'Vn', 10e-9)
# Large resistor in parallel with Cf to define the DC operating point
circuit.R('leak', 'Vout', 'Vn', 100e6)
simulator = circuit.simulator()
