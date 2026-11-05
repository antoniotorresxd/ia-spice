from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
# Wien Bridge RC Network
# Parallel RC: R1, C1 between Vout and Vplus
circuit.R('1', 'Vout', 'Vplus', 10@u_kΩ)
circuit.C('1', 'Vout', 'Vplus', 10@u_nF)
# Series RC: R2, C2 between Vplus and ground
circuit.R('2', 'Vplus', circuit.gnd, 10@u_kΩ)
circuit.C('2', 'Vplus', circuit.gnd, 10@u_nF)
# Amplifier Gain Stage using a Voltage-Controlled Voltage Source (E-element)
# To achieve oscillation, gain Av >= 3 (we set Av = 3.1)
# Vout = Av * (Vplus - Vminus)
# We use a resistive divider for the negative feedback: R3 (Vminus to gnd), R4 (Vout to Vminus)
circuit.R('3', 'Vminus', circuit.gnd, 10@u_kΩ)
circuit.R('4', 'Vout', 'Vminus', 21@u_kΩ)
# Op-amp modeling using behavioral voltage source with high gain
# E_amp output between Vout and gnd, controlled by Vplus and Vminus
circuit.V('dummy', 'Vctrl', circuit.gnd, 0@u_V) # Dummy source for reference if needed, or use E element directly
circuit.element_table['E1'] = 'E_amp Vout 0 Vplus Vminus 100000.0'
# Analysis Part
simulator = circuit.simulator()
