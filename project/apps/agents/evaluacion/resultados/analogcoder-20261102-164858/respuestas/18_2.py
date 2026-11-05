from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Integrator')
# Define the MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)     # 5 V supply
circuit.V('in', 'Vin', circuit.gnd, 2.5)     # 2.5 V DC input (common-mode level)
circuit.V('bias', 'Vbias', circuit.gnd, 2.5) # 2.5 V reference on non-inverting input
circuit.V('tail', 'Vtail', circuit.gnd, 1.5) # 1.5 V gate bias for tail current source
# Op-amp: 5-transistor OTA
# Differential pair (NMOS)
circuit.MOSFET('1', 'Xnode', 'Vbias', 'Vs', 'Vs', model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vinn', 'Vs', 'Vs', model='nmos_model', w=20e-6, l=1e-6)
# Current mirror active load (PMOS)
circuit.MOSFET('3', 'Xnode', 'Xnode', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('4', 'Vout', 'Xnode', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
# Tail current source (NMOS)
circuit.MOSFET('5', 'Vs', 'Vtail', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Integrator network: input resistor and feedback capacitor
circuit.R('1', 'Vin', 'Vinn', 10@u_kΩ)
circuit.C('f', 'Vinn', 'Vout', 10@u_pF)
simulator = circuit.simulator()
