from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Inverting Op-Amp Adder')
# Supplies: +5 V and -5 V rails are needed for negative output voltage.
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ee', 'Vee', circuit.gnd, -5.0)
# DC input operating-point values
circuit.V('in1', 'Vin1', circuit.gnd, 0.5)
circuit.V('in2', 'Vin2', circuit.gnd, 0.5)
# Matched input and feedback resistors
circuit.R('1', 'Vin1', 'Vsum', 10@u_kΩ)
circuit.R('2', 'Vin2', 'Vsum', 10@u_kΩ)
circuit.R('f', 'Vout', 'Vsum', 10@u_kΩ)
# High-gain op-amp macromodel:
# Vout = A * (Vnoninverting - Vinverting)
# Non-inverting input is grounded; inverting input is Vsum.
circuit.VCVS('Aop', 'Vout', circuit.gnd, circuit.gnd, 'Vsum', 1e6)
simulator = circuit.simulator()
