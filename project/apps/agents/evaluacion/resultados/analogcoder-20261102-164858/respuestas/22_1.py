from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-inverting Schmitt Trigger')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('in', 'Vin', circuit.gnd, 0.0)      # Input signal source (DC operating point)
circuit.V('bias', 'Vbias', circuit.gnd, 1.0)  # Tail-current bias (V_th + 0.5 V)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)    # Reference at mid-supply on inverting input
# Op-amp: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'nA', 'Vp', 'Ntail', 'Ntail', model='nmos_model', w=10e-6, l=1e-6)   # M1 (non-inverting input)
circuit.MOSFET('2', 'Vout', 'Vref', 'Ntail', 'Ntail', model='nmos_model', w=10e-6, l=1e-6) # M2 (inverting input)
circuit.MOSFET('3', 'nA', 'nA', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)        # M3 (diode-connected load)
circuit.MOSFET('4', 'Vout', 'nA', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)      # M4 (mirror load)
circuit.MOSFET('5', 'Ntail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)  # M5 (tail current)
# Positive-feedback Schmitt network
circuit.R('1', 'Vin', 'Vp', 10e3)   # R1 = 10 kOhm input resistor
circuit.R('2', 'Vout', 'Vp', 40e3)  # R2 = 40 kOhm positive feedback resistor
simulator = circuit.simulator()
