from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# Define the MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power Supplies for the power and bias voltages
circuit.V('dd', 'Vdd', circuit.gnd, 5.0) # 5V power supply
circuit.V('bias', 'Vbias_gate', circuit.gnd, 1.0) # 1V bias for NMOS gate (= V_th + 0.5)
circuit.V('pbias', 'V_pmos_bias', circuit.gnd, 4.0) # 4V bias for PMOS load
# Biasing resistor for NMOS gate
circuit.R('bias', 'Vin_gate', 'Vbias_gate', 100@u_kΩ)
# Amplifier Stage: Common-Source with Active Load
# Parameters: name, drain, gate, source, bulk, model, w, l
circuit.MOSFET('1', 'Vout', 'Vin_gate', circuit.gnd, circuit.gnd, model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('2', 'Vout', 'V_pmos_bias', 'Vdd', 'Vdd', model='pmos_model', w=100e-6, l=1e-6)
# DC Blocking / AC Coupling Capacitor between feedback network and gate
circuit.C('cc', 'V_fb3', 'Vin_gate', 1@u_uF)
# RC Phase-Shift Network (Three stages)
# Stage 3
circuit.R('3', 'Vout', 'V_fb1', 10@u_kΩ)
circuit.C('3', 'V_fb1', circuit.gnd, 10@u_nF)
# Stage 2
circuit.R('2', 'V_fb1', 'V_fb2', 10@u_kΩ)
circuit.C('2', 'V_fb2', circuit.gnd, 10@u_nF)
# Stage 1
circuit.R('1', 'V_fb2', 'V_fb3', 10@u_kΩ)
circuit.C('1', 'V_fb3', circuit.gnd, 10@u_nF)
# Analysis Part
simulator = circuit.simulator()
