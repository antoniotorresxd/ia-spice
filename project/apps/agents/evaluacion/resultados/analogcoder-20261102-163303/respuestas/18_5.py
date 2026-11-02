from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Define transistor models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power Supplies and Biasing
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('in', 'Vin', circuit.gnd, 2.5) # Input voltage node (DC operating point)
circuit.V('bias_inv', 'V_non_inv', circuit.gnd, 2.5) # Non-inverting terminal biased at 2.5V
circuit.V('tail_bias', 'V_tail', circuit.gnd, 1.0) # Tail current bias
# Op-Amp Sub-components (Two-Stage Op-Amp Design)
# Differential Input Stage (M1, M2), Active Load (M3, M4), Tail Current Source (M5)
circuit.MOSFET('1', 'DiffOut', 'Vinv', 'TailNode', 'TailNode', model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('2', 'OpAmpMid', 'V_non_inv', 'TailNode', 'TailNode', model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('3', 'DiffOut', 'DiffOut', 'Vdd', 'Vdd', model='pmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('4', 'OpAmpMid', 'DiffOut', 'Vdd', 'Vdd', model='pmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('5', 'TailNode', 'V_tail', circuit.gnd, circuit.gnd, model='nmos_model', w=50e-6, l=1e-6)
# Second Stage (Common-Source Output Driver: M6)
circuit.MOSFET('6', 'Vout', 'OpAmpMid', circuit.gnd, circuit.gnd, model='nmos_model', w=100e-6, l=1e-6)
circuit.R('load', 'Vout', 'Vdd', 10@u_kΩ)
# Integrator External Components (R1 and Cf)
circuit.R('1', 'Vin', 'Vinv', 10@u_kΩ)
circuit.C('f', 'Vout', 'Vinv', 100@u_pF)
# Analysis Part
simulator = circuit.simulator()
