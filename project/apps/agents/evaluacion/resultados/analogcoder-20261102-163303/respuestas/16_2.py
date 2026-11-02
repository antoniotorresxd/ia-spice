from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Define the MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power Supplies and Biasing
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('bias', 'Vbias', circuit.gnd, 4.0) # 4V bias for PMOS current source
# Amplifier Stage: Common-Source with Active Load
# parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'Drain1', 'Vin', circuit.gnd, circuit.gnd, model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('2', 'Drain1', 'Vbias', 'Vdd', 'Vdd', model='pmos_model', w=100e-6, l=1e-6)
# Output definition
circuit.R('out_load', 'Drain1', 'Vout', 1@u_mΩ) # Zero-volt/low-resistance connection to define Vout at Drain1
# RC Phase-Shift Network (3 cascaded RC sections providing 180 degrees phase shift)
circuit.R('1', 'Drain1', 'N_phase1', 10@u_kΩ)
circuit.C('1', 'N_phase1', circuit.gnd, 10@u_nF)
circuit.R('2', 'N_phase1', 'N_phase2', 10@u_kΩ)
circuit.C('2', 'N_phase2', circuit.gnd, 10@u_nF)
circuit.R('3', 'N_phase2', 'Vin', 10@u_kΩ)
circuit.C('3', 'Vin', circuit.gnd, 10@u_nF)
# Analysis Part
simulator = circuit.simulator()
