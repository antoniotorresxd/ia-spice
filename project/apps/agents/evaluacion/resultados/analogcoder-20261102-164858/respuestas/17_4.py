from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Ideal op-amp modeled as a voltage-controlled voltage source
# Output: Vout (referenced to ground), non-inverting input: Vp, inverting input: '-'
circuit.VCVS('op', 'Vout', circuit.gnd, 'Vp', '-', 1e6)
# Wien bridge frequency-selective network
# Series RC arm: Vout -> R1 -> Nser -> C1 -> Vp
circuit.R('1', 'Vout', 'Nser', 10e3)     # R1 = 10 kOhm
circuit.C('1', 'Nser', 'Vp', 16e-9)      # C1 = 16 nF
# Parallel RC arm: Vp -> (R2 || C2) -> ground
circuit.R('2', 'Vp', circuit.gnd, 10e3)  # R2 = 10 kOhm
circuit.C('2', 'Vp', circuit.gnd, 16e-9) # C2 = 16 nF
# Gain-setting network (non-inverting amplifier, gain = 1 + Rf/Rg = 3.2)
circuit.R('f', 'Vout', '-', 2.2e3)       # Rf = 2.2 kOhm
circuit.R('g', '-', circuit.gnd, 1e3)    # Rg = 1 kOhm
simulator = circuit.simulator()
