from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('OpAmp Integrator')
# MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('bias', 'Vbias', circuit.gnd, 1.2)  # tail bias: Vgs ~ Vth + 0.5 = 1.0 V plus margin
circuit.V('ref', 'Vref', circuit.gnd, 2.5)    # non-inverting input reference (mid-supply)
circuit.V('in', 'Vin', circuit.gnd, 2.5)      # integrator input DC level
# Op-amp: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
circuit.MOSFET('1', 'Vd1', 'Vref', 'Vtail', 'Vtail', model='nmos_model', w=50e-6, l=1e-6)   # M1
circuit.MOSFET('2', 'Vout', 'Vneg', 'Vtail', 'Vtail', model='nmos_model', w=50e-6, l=1e-6)  # M2
circuit.MOSFET('3', 'Vd1', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)        # M3
circuit.MOSFET('4', 'Vout', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=20e-6, l=1e-6)       # M4
circuit.MOSFET('5', 'Vtail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)  # M5
# Integrator feedback network
circuit.R('1', 'Vin', 'Vneg', 10e3)     # R1 = 10 kOhm input resistor
circuit.C('f', 'Vneg', 'Vout', 10e-12)  # Cf = 10 pF integrating capacitor
circuit.R('f', 'Vneg', 'Vout', 10e6)    # Rf = 10 MOhm, defines DC operating point
# Analysis Part
simulator = circuit.simulator()
