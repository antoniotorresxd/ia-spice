from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Differentiator')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0@u_V)       # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.0@u_V)   # NMOS bias voltage
circuit.V('cm', 'Vinp', circuit.gnd, 2.5@u_V)      # Non-inverting input reference (mid-supply)
circuit.V('in', 'Vin', circuit.gnd, 2.5@u_V)       # Differentiator input (DC operating point)
# ---------------- Op-amp: Stage 1 (differential pair + mirror load) ----------------
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'n1', 'Vinn', 'tail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('2', 'n2', 'Vinp', 'tail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
circuit.MOSFET('3', 'n1', 'n1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('4', 'n2', 'n1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
circuit.MOSFET('5', 'tail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
# ---------------- Op-amp: Stage 2 (common-source + current-source load) ----------------
circuit.MOSFET('6', 'Vout', 'n2', 'Vdd', 'Vdd', model='pmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('7', 'Vout', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# Miller compensation capacitor
circuit.C('c', 'n2', 'Vout', 1@u_pF)
# ---------------- Differentiator network ----------------
circuit.C('1', 'Vin', 'Vinn', 1@u_nF)    # C1: input capacitor
circuit.R('f', 'Vinn', 'Vout', 10@u_kΩ)  # Rf: feedback resistor
# Analysis Part
simulator = circuit.simulator()
