from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Integrator')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('cm', 'Vcm', circuit.gnd, 2.5)      # Non-inverting input reference (mid-supply)
circuit.V('bias', 'Vbias', circuit.gnd, 1.0)  # Tail bias = V_th + 0.5 V
circuit.V('in', 'Vin', circuit.gnd, 2.5)      # Input DC operating point
# Op-amp: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
# Differential pair
circuit.MOSFET('1', 'Vx', 'Vn', 'Vt', 'Vt', model='nmos_model', w=10e-6, l=1e-6)    # M1 (inverting)
circuit.MOSFET('2', 'Vout', 'Vcm', 'Vt', 'Vt', model='nmos_model', w=10e-6, l=1e-6) # M2 (non-inverting)
# PMOS current mirror load
circuit.MOSFET('3', 'Vx', 'Vx', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)   # M3 (diode-connected)
circuit.MOSFET('4', 'Vout', 'Vx', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6) # M4 (mirror)
# NMOS tail current source
circuit.MOSFET('5', 'Vt', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)  # M5
# Integrator network
circuit.R('1', 'Vin', 'Vn', 10e3)      # R1 = 10 kOhm input resistor
circuit.C('f', 'Vout', 'Vn', 10e-12)   # Cf = 10 pF feedback capacitor
circuit.R('f', 'Vout', 'Vn', 10e6)     # Rf = 10 MOhm DC feedback (sets DC operating point)
# Analysis Part
simulator = circuit.simulator()
