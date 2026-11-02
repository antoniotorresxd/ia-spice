from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Op-Amp Integrator')
# Device models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power supply and bias sources
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)      # 5 V supply
circuit.V('cm', 'Vcm', circuit.gnd, 2.5)      # Non-inverting reference (mid-supply)
circuit.V('bias', 'Vbias', circuit.gnd, 1.0)  # Tail bias: Vth + 0.5 V = 1.0 V
circuit.V('in', 'Vin', circuit.gnd, 2.5)      # Integrator input (DC operating point only)
# Op-amp: 5-transistor OTA
# MOSFET(name, drain, gate, source, bulk, model, w, l)
# M1: non-inverting input device (gate = Vcm)
circuit.MOSFET('1', 'Vd1', 'Vcm', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# M2: inverting input device (gate = Vminus, output drain = Vout)
circuit.MOSFET('2', 'Vout', 'Vminus', 'Ntail', circuit.gnd, model='nmos_model', w=20e-6, l=1e-6)
# M3: diode-connected PMOS load on the M1 branch
circuit.MOSFET('3', 'Vd1', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
# M4: PMOS mirror output device
circuit.MOSFET('4', 'Vout', 'Vd1', 'Vdd', 'Vdd', model='pmos_model', w=10e-6, l=1e-6)
# M5: NMOS tail current source
circuit.MOSFET('5', 'Ntail', 'Vbias', circuit.gnd, circuit.gnd, model='nmos_model', w=10e-6, l=1e-6)
# Integrator network around the op-amp
circuit.R('1', 'Vin', 'Vminus', 10e3)     # R1 = 10 kOhm input resistor
circuit.C('f', 'Vminus', 'Vout', 10e-12)  # Cf = 10 pF feedback capacitor
circuit.R('f', 'Vminus', 'Vout', 10e6)    # Rf = 10 MOhm DC feedback (sets operating point)
# Analysis Part
simulator = circuit.simulator()
