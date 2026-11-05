from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Power Supplies for the Op-Amp (+5V and -5V dual supply)
circuit.V('cc', 'Vdd', circuit.gnd, 5.0)
circuit.V('ee', 'Vss', circuit.gnd, -5.0)
# Behavioral Op-Amp subcircuit or standard differential amplifier representation
# Using a subcircuit model for an ideal operational amplifier
circuit.include('opamp.lib') # Assuming standard availability or defining a simple equivalent
# Alternatively, we can use a VCVS (E element) to model an ideal op-amp with high gain:
# E_opamp Vout 0 (V_plus - V_minus) 1e5
# For PySpice compatibility, we implement an ideal differential amplifier using standard components or behavioral sources:
# Let's define the Wien Bridge RC networks
# Series RC branch: Vout -> R1 -> V_bridge -> C1 -> gnd
circuit.R('1', 'Vout', 'V_bridge', 10e3)
circuit.C('1', 'V_bridge', circuit.gnd, 10e-9)
# Parallel RC branch: Vout -> C2 -> V_bridge, and Vout -> R2 -> V_bridge ... wait, standard bridge configuration:
# Series network: Vout to V_plus (R1 in series with C1)
# Parallel network: V_plus to Ground (R2 in parallel with C2)
circuit.R('1', 'Vout', 'V_plus', 15.9e3)
circuit.C('1', 'V_plus', 'V_bridge1', 10e-9)
circuit.R('2', 'V_bridge1', circuit.gnd, 15.9e3)
# Connecting the parallel node to V_plus
circuit.C('2', 'Vout', 'V_plus', 10e-9) # Wait, standard Wien bridge:
# Series RC (R_s, C_s) from Vout to V_plus.
# Parallel RC (R_p || C_p) from V_plus to Ground.
# Let's fix the net names properly:
# Series: R_series from Vout to V_plus, C_series from V_plus to ground? No.
# Standard Wien Bridge:
# From Vout to V_plus: R1 in series with C1. Let's use an intermediate node V_ser.
circuit.R('series', 'Vout', 'V_ser', 10@u_kΩ)
circuit.C('series', 'V_ser', 'V_plus', 15.9@u_nF)
# Parallel: R2 and C2 in parallel from V_plus to ground
circuit.R('parallel', 'V_plus', circuit.gnd, 10@u_kΩ)
circuit.C('parallel', 'V_plus', circuit.gnd, 15.9@u_nF)
# Negative feedback network for gain setting (Gain = 1 + R_f/R_in = 3)
circuit.R('f', 'Vout', 'V_minus', 20@u_kΩ)
circuit.R('in', 'V_minus', circuit.gnd, 10@u_kΩ)
# Op-Amp implementation using a high-gain Voltage-Controlled Voltage Source (VCVS)
# Syntax: circuit.VCCS / Circuit.X / E element
# PySpice custom behavioral source for Op-Amp: E_opamp Vout_opamp 0 V_plus V_minus 100k
circuit.element_factory('E', 'E_opamp', 'Vout', circuit.gnd, 'V_plus', 'V_minus', 100000.0)
# Analysis Part
simulator = circuit.simulator()
