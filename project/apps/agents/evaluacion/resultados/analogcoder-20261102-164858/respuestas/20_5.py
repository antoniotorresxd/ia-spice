from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Inverting Summing Amplifier')
# Define the MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supplies (dual rail: Vdd = +5 V, Vss = -5 V)
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ss', 'Vss', circuit.gnd, -5.0)
# Bias voltage for tail current source M5: Vbias = Vdd - (|Vth| + Vov) = 5 - (0.5 + 0.45) = 4.05 V
circuit.V('bias', 'Vbias', circuit.gnd, 4.05)
# Input sources (DC operating point)
circuit.V('in1', 'Vin1', circuit.gnd, 1.0)
circuit.V('in2', 'Vin2', circuit.gnd, 0.5)
# Op-amp: five-transistor OTA (PMOS input pair, NMOS mirror load, PMOS tail)
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'N1', circuit.gnd, 'Vtail', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)   # M1: non-inverting input (V+ = 0 V)
circuit.MOSFET('2', 'Vout', 'Vminus', 'Vtail', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)    # M2: inverting input (V-)
circuit.MOSFET('5', 'Vtail', 'Vbias', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)      # M5: tail current source
circuit.MOSFET('3', 'N1', 'N1', 'Vss', 'Vss', model='nmos_model', w=10e-6, l=1e-6)            # M3: diode-connected mirror reference
circuit.MOSFET('4', 'Vout', 'N1', 'Vss', 'Vss', model='nmos_model', w=10e-6, l=1e-6)          # M4: mirror output
# Summing network: Vout = -(Vin1 + Vin2)
circuit.R('1', 'Vin1', 'Vminus', 100@u_kΩ)   # input resistor R1
circuit.R('2', 'Vin2', 'Vminus', 100@u_kΩ)   # input resistor R2
circuit.R('f', 'Vminus', 'Vout', 100@u_kΩ)   # feedback resistor Rf
# Analysis Part
simulator = circuit.simulator()
