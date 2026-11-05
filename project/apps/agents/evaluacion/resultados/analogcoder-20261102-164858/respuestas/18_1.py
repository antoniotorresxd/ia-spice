from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Integrator')
# Device models (level 1)
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5, lambda_=0.02)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5, lambda_=0.02)
# Power supplies and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0@u_V)      # 5 V supply
circuit.V('in', 'Vin', circuit.gnd, 2.5@u_V)      # Input node, DC level at common mode
circuit.V('cm', 'Vcm', circuit.gnd, 2.5@u_V)      # Non-inverting input reference (Vcm)
circuit.V('bias', 'Vbias', circuit.gnd, 1.0@u_V)  # NMOS bias: Vth + 0.5 V overdrive
# ---------------- Op-amp: Stage 1 (NMOS diff pair + PMOS mirror load) ----------------
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Dm1', 'Vinv', 'Ntail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)   # M1 (inverting input)
circuit.MOSFET('2', 'Vst1', 'Vcm', 'Ntail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)   # M2 (non-inverting input)
circuit.MOSFET('5', 'Ntail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)  # M5 tail source
circuit.MOSFET('3', 'Dm1', 'Dm1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)           # M3 diode-connected load
circuit.MOSFET('4', 'Vst1', 'Dm1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)          # M4 mirror load
# ---------------- Op-amp: Stage 2 (PMOS common source + NMOS current source) ----------------
circuit.MOSFET('6', 'Vout', 'Vst1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)         # M6 gain device
circuit.MOSFET('7', 'Vout', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)  # M7 current source
# Miller compensation capacitor
circuit.C('c', 'Vst1', 'Vout', 1@u_pF)
# ---------------- Integrator network ----------------
circuit.R('1', 'Vin', 'Vinv', 10@u_kΩ)     # R1 input resistor
circuit.C('f', 'Vinv', 'Vout', 1@u_pF)     # Cf feedback capacitor
circuit.R('f', 'Vinv', 'Vout', 10@u_MΩ)    # Large resistor for DC bias definition
# Analysis Part
simulator = circuit.simulator()
