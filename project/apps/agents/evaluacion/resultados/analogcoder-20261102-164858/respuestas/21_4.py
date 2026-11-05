from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Subtractor')
# Device models (Level 1)
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5, lambda_=0.02)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5, lambda_=0.02)
# Power supply and input sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 0.85) # OTA tail bias
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)    # Input 1 (DC)
circuit.V('in2', 'Vin2', circuit.gnd, 3.0)    # Input 2 (DC), expected Vout = 2.0 V
# ---------------- Op-amp: 5-transistor OTA ----------------
# MOSFET(name, drain, gate, source, bulk, model, w, l)
# M1: non-inverting input device (gate = Vplus), drain = node A (diode side)
circuit.MOSFET('1', 'NodeA', 'Vplus', 'Tail', circuit.gnd, model='nmos_model', w=25e-6, l=2e-6)
# M2: inverting input device (gate = Vminus), drain = Vout (OTA output)
circuit.MOSFET('2', 'Vout', 'Vminus', 'Tail', circuit.gnd, model='nmos_model', w=25e-6, l=2e-6)
# M3: PMOS diode-connected load
circuit.MOSFET('3', 'NodeA', 'NodeA', 'Vdd', 'Vdd', model='pmos_model', w=22e-6, l=2e-6)
# M4: PMOS mirror load
circuit.MOSFET('4', 'Vout', 'NodeA', 'Vdd', 'Vdd', model='pmos_model', w=22e-6, l=2e-6)
# M5: NMOS tail current source
circuit.MOSFET('5', 'Tail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=2e-6)
# ---------------- Difference amplifier feedback network ----------------
circuit.R('1', 'Vin1', 'Vminus', 10@u_kΩ)   # R1
circuit.R('2', 'Vminus', 'Vout', 10@u_kΩ)   # R2 (feedback)
circuit.R('3', 'Vin2', 'Vplus', 10@u_kΩ)    # R3
circuit.R('4', 'Vplus', circuit.gnd, 10@u_kΩ)  # R4
# Analysis Part
simulator = circuit.simulator()
