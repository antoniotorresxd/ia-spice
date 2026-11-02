from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('CMOS Opamp Inverting Adder')
# Simple Level 1 MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Supplies: +5 V and -5 V are used so Vout can be negative
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ss', 'Vss', circuit.gnd, -5.0)
# DC input examples and PMOS current-source bias
circuit.V('in1', 'Vin1', circuit.gnd, 0.1)
circuit.V('in2', 'Vin2', circuit.gnd, 0.1)
circuit.V('bp', 'VBP', circuit.gnd, 4.2)
# Inverting summing network
circuit.R('in1', 'Vin1', 'Vsum', 10e3)
circuit.R('in2', 'Vin2', 'Vsum', 10e3)
circuit.R('f', 'Vout', 'Vsum', 10e3)
# First stage: PMOS differential pair with NMOS current-mirror load
# MOSFET arguments: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'N1', 'Vsum', 'Ntail', 'Ntail',
               model='pmos_model', w=100e-6, l=2e-6)
circuit.MOSFET('2', 'N2', circuit.gnd, 'Ntail', 'Ntail',
               model='pmos_model', w=100e-6, l=2e-6)
circuit.MOSFET('3', 'Ntail', 'VBP', 'Vdd', 'Vdd',
               model='pmos_model', w=100e-6, l=2e-6)
circuit.MOSFET('4', 'N1', 'N1', 'Vss', 'Vss',
               model='nmos_model', w=50e-6, l=2e-6)
circuit.MOSFET('5', 'N2', 'N1', 'Vss', 'Vss',
               model='nmos_model', w=50e-6, l=2e-6)
# Second stage: NMOS common-source amplifier with PMOS current-source load
circuit.MOSFET('6', 'Vout', 'N2', 'Vss', 'Vss',
               model='nmos_model', w=50e-6, l=2e-6)
circuit.MOSFET('7', 'Vout', 'VBP', 'Vdd', 'Vdd',
               model='pmos_model', w=50e-6, l=2e-6)
simulator = circuit.simulator()
