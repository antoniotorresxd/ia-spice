from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Model definitions
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5, lambda_=0.02)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5, lambda_=0.02)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('in', 'Vin', circuit.gnd, 2.5)      # DC input at mid-supply
circuit.V('ref', 'Vplus', circuit.gnd, 2.5)   # Non-inverting reference (virtual ground level)
circuit.V('bn', 'Vbn', circuit.gnd, 1.0)      # Tail bias = V_th + 0.5 V
# Op-amp: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Vd1', 'Vplus', 'Vtail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'Vn', 'Vtail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('3', 'Vd1', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('4', 'Vout', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('5', 'Vtail', 'Vbn', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
# Integrator network
circuit.R('1', 'Vin', 'Vn', 10@u_kΩ)     # Input resistor R1
circuit.C('f', 'Vn', 'Vout', 10@u_pF)    # Feedback capacitor Cf
circuit.R('f', 'Vn', 'Vout', 10e6)       # Large DC feedback resistor (bias only)
# Analysis Part
simulator = circuit.simulator()
