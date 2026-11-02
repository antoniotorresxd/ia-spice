from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Opamp Adder')
# Power Supplies
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)  # Positive power supply
circuit.V('ss', 'Vss', circuit.gnd, -5.0) # Negative power supply
# Input Signal Sources for Vin1 and Vin2
circuit.V('in1', 'Vin1', circuit.gnd, 1.0) # 1V input 1
circuit.V('in2', 'Vin2', circuit.gnd, 2.0) # 2V input 2
# Resistor Network for Inverting Summing Amplifier (Vout = -(Vin1 + Vin2))
# Using 10k resistors for R1, R2, and Rf to get a gain of -1 for each input.
circuit.R('1', 'Vin1', 'V_inv', 10@u_kΩ)
circuit.R('2', 'Vin2', 'V_inv', 10@u_kΩ)
circuit.R('f', 'V_inv', 'Vout', 10@u_kΩ)
# Resistor on the non-inverting terminal for bias current compensation
circuit.R('3', 'V_noninv', circuit.gnd, 3.33@u_kΩ)
circuit.R('gnd_noninv', 'V_noninv', circuit.gnd, 0@u_kΩ) # tied to gnd directly
# Behavioral or subcircuit representation of an Op-Amp using a voltage-controlled voltage source (VCES)
# Pins: non-inverting input, inverting input, positive supply, negative supply, output
# For an ideal differential amplifier behavior: Vout = A * (V_noninv - V_inv)
# Here we use a high gain (A = 1e5) controlled source connected between Vout and gnd.
circuit.X('opamp', 'opamp', 'V_noninv', 'V_inv', 'Vdd', 'Vss', 'Vout')
# Define the opamp subcircuit model
@circuit.subcircuit('opamp', 'plus', 'minus', 'vdd', 'vss', 'out')
def opamp(subcircuit):
    # Input stage differential resistance
    subcircuit.R('in', 'plus', 'minus', 10.0@u_MΩ)
    # Gain stage: output voltage depends on differential input (plus - minus)
    subcircuit.Vcvs('ol', 'n_out', subcircuit.gnd, 'plus', 'minus', 100000.0)
    # Output buffer resistance
    subcircuit.R('out', 'n_out', 'out', 75.0)
# Analysis Part
simulator = circuit.simulator()
