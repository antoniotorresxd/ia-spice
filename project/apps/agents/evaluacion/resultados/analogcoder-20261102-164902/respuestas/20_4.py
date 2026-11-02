from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Inverting Op-Amp Adder')
# Intended op-amp supply rails
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ss', 'Vss', circuit.gnd, -5.0)
# DC input operating values
circuit.V('in1', 'Vin1', circuit.gnd, 0.5)
circuit.V('in2', 'Vin2', circuit.gnd, 0.5)
# Equal input and feedback resistors produce
# Vout = -(Vin1 + Vin2)
circuit.R('in1', 'Vin1', 'Vsum', 10@u_kΩ)
circuit.R('in2', 'Vin2', 'Vsum', 10@u_kΩ)
circuit.R('f', 'Vout', 'Vsum', 10@u_kΩ)
# Ideal high-gain op-amp macromodel:
# output = gain * (non-inverting input - inverting input)
# Non-inverting input is grounded; inverting input is Vsum.
circuit.VCVS('A1', 'Vout', circuit.gnd, circuit.gnd, 'Vsum', 1e9)
simulator = circuit.simulator()
