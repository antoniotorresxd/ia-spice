from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Power Supplies for the op-amp (+5V and -5V for symmetric hysteresis)
circuit.V('cc', 'Vcc', circuit.gnd, 5.0)
circuit.V('ee', 'Vss', circuit.gnd, -5.0)
# Input Signal Source (DC operating point input)
circuit.V('in', 'Vin', circuit.gnd, 1.0)
# Resistors for the positive feedback network (Hysteresis set by R1 and R2)
# Feedback resistor R2 connects Vout to the inverting input (node 'Vinv')
circuit.R('2', 'Vout', 'Vinv', 10@u_kΩ)
# Resistor R1 connects the inverting input to ground
circuit.R('1', 'Vinv', circuit.gnd, 10@u_kΩ)
# Op-Amp implementation using behavioral sources (E-element) to model a saturated op-amp
# The op-amp non-inverting input is Vin, inverting input is Vinv, output is Vout.
# Gain is set high (e.g., 100k) with output clamped between Vss and Vcc.
circuit.Sin('opamp_diff', 'V_diff', circuit.gnd, amplitude=1) # Dummy line or direct behavioral source below:
# Using PySpice nonlinear dependent source or subcircuit for op-amp:
# E-source for differential voltage amplification with saturation:
# Vout = Table(A*(V(Vin) - V(Vinv))) clamped to [Vss, Vcc]
# For simplicity in standard SPICE netlist without subcircuits, we use a behavioral voltage source:
circuit.behavioral_source('amp', 'Vout', circuit.gnd, expression='min(max(100000 * (V(Vin) - V(Vinv)), -5.0), 5.0)')
# Analysis Part
simulator = circuit.simulator()
