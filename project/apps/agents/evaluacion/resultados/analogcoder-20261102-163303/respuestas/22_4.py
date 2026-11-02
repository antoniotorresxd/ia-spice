from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Define MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Power Supplies (+5V and -5V dual supply for the op-amp)
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ss', 'Vss', circuit.gnd, -5.0)
# Input Signal Source (Vin = 0V DC operating point)
circuit.V('in', 'Vin', circuit.gnd, 0.0)
# --- Op-Amp Subcircuit Definition (High-Gain Two-Stage Op-Amp) ---
# Nodes: Vp (non-inverting), Vn (inverting), Vout_op, Vdd, Vss, gnd
# Input stage: Differential pair M1, M2 with current source tail and PMOS active load
# M1 gate = Vn (Vin), M2 gate = Vp (feedback node)
# Tail current source biasing
circuit.I('tail', 'TailNode', 'Vss', 100@u_A)
circuit.MOSFET('tail_trans', 'TailNode', 'Vbias_tail', 'Vss', 'Vss', model='nmos_model', w=20e-6, l=1e-6)
# Simple fixed bias for tail
circuit.V('bias_tail_src', 'Vbias_tail', 'Vss', 1.2)
# Differential pair
circuit.MOSFET('1', 'Drain1', 'Vin', 'TailNode', 'TailNode', model='nmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('2', 'Vop_int', 'V_feedback', 'TailNode', 'TailNode', model='nmos_model', w=50e-6, l=1e-6)
# PMOS active load for differential pair
circuit.MOSFET('3', 'Drain1', 'Drain1', 'Vdd', 'Vdd', model='pmos_model', w=50e-6, l=1e-6)
circuit.MOSFET('4', 'Vop_int', 'Drain1', 'Vdd', 'Vdd', model='pmos_model', w=50e-6, l=1e-6)
# Second stage (Common-source amplifier)
circuit.MOSFET('5', 'Vout', 'Vop_int', 'Vss', 'Vss', model='nmos_model', w=200e-6, l=1e-6)
circuit.R('load', 'Vout', 'Vdd', 10@u_kΩ)
# --- Schmitt Trigger Feedback Network ---
# Resistor R1 between Vout and V_feedback (non-inverting input)
circuit.R('1', 'Vout', 'V_feedback', 10@u_kΩ)
# Resistor R2 between V_feedback and ground
circuit.R('2', 'V_feedback', circuit.gnd, 10@u_kΩ)
# Analysis Part
simulator = circuit.simulator()
