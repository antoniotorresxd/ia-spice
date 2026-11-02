from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-inverting Schmitt Trigger')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)          # 5 V supply
circuit.V('in', 'Vin', circuit.gnd, 0.0)          # Input voltage (DC operating point)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)        # Reference at inverting input (mid-supply)
circuit.V('bias1', 'Vbias1', circuit.gnd, 1.2)    # Tail current source bias
circuit.V('bias2', 'Vbias2', circuit.gnd, 0.9)    # Output sink bias
# ---------------- Op-amp: Stage 1 (5T OTA) ----------------
# parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'OA_d1', 'Vref', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)  # M1
circuit.MOSFET('2', 'Out1', 'Vp', 'Tail', circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)     # M2
circuit.MOSFET('3', 'OA_d1', 'OA_d1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)         # M3 (diode mirror)
circuit.MOSFET('4', 'Out1', 'OA_d1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)          # M4 (mirror output)
circuit.MOSFET('5', 'Tail', 'Vbias1', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)  # M5 (tail)
# ---------------- Op-amp: Stage 2 (common-source with current sink) ----------------
circuit.MOSFET('6', 'Vout', 'Out1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)           # M6
circuit.MOSFET('7', 'Vout', 'Vbias2', circuit.gnd, circuit.gnd, model='nmos_model', w=5e-6, l=1e-6)  # M7
# ---------------- Positive feedback network ----------------
circuit.R('in', 'Vin', 'Vp', 10@u_kΩ)      # Rin = 10 kΩ
circuit.R('f', 'Vout', 'Vp', 100@u_kΩ)    # Rf = 100 kΩ
# Analysis Part
simulator = circuit.simulator()
