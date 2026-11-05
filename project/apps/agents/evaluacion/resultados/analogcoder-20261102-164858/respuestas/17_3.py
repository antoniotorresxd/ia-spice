from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# Diode model for amplitude stabilization
circuit.model('DMOD', 'D', IS=1e-14)
# Ideal op-amp modeled as a high-gain VCVS
# E: output+ (Vout), output- (gnd), input+ (Vplus), input- (Vminus), gain
circuit.VCVS('1', 'Vout', circuit.gnd, 'Vplus', 'Vminus', 1e5)
# Wien bridge frequency-selective network (f0 = 1/(2*pi*R*C) ~ 1.59 kHz)
circuit.R('1', 'Vout', 'Vs', 10e3)        # R1 series arm
circuit.C('1', 'Vs', 'Vplus', 10e-9)      # C1 series arm
circuit.R('2', 'Vplus', circuit.gnd, 10e3)    # R2 parallel arm
circuit.C('2', 'Vplus', circuit.gnd, 10e-9)   # C2 parallel arm
# Amplitude-setting negative feedback network (gain = 1 + Rf/Rg = 3.2)
circuit.R('f', 'Vout', 'Vminus', 22e3)   # Rf
circuit.R('g', 'Vminus', circuit.gnd, 10e3)  # Rg
# Anti-parallel diodes across Rf for amplitude limiting
circuit.D('1', 'Vminus', 'Vout', model='DMOD')
circuit.D('2', 'Vout', 'Vminus', model='DMOD')
# Analysis Part
simulator = circuit.simulator()
