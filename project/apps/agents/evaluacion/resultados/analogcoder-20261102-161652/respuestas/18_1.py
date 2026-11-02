from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Opamp Integrator')
# 5 V single supply and 2.5 V reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)
# DC operating-point value for Vin; signal variations are centered around Vref
circuit.V('in', 'Vin', circuit.gnd, 2.5)
# Inverting integrator: R1 from Vin to the summing node,
# and Cf from the output back to the summing node
circuit.R('1', 'Vin', 'Vsum', 10e3)
circuit.C('f', 'Vout', 'Vsum', 10e-6)
# Idealized high-gain op-amp:
# output nodes: Vout and ground
# differential input nodes: Vref (non-inverting) and Vsum (inverting)
circuit.VCVS('opamp', 'Vout', circuit.gnd, 'Vref', 'Vsum', 1e5)
simulator = circuit.simulator()
