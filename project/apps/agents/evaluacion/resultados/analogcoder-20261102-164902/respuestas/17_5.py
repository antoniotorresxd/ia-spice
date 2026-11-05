from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Wien Bridge Oscillator')
# 5 V supply and AC-grounded midpoint reference
circuit.V('dd', 'Vdd', circuit.gnd, 5 @ u_V)
circuit.R('3', 'Vdd', 'Vmid', 100 @ u_kΩ)
circuit.R('4', 'Vmid', circuit.gnd, 100 @ u_kΩ)
circuit.C('3', 'Vmid', circuit.gnd, 10 @ u_uF)
# Wien bridge: series RC from output to Wien node,
# and parallel RC from Wien node to the midpoint reference
circuit.C('1', 'Vout', 'Nseries', 10 @ u_nF)
circuit.R('1', 'Nseries', 'Wien', 10 @ u_kΩ)
circuit.R('2', 'Wien', 'Vmid', 10 @ u_kΩ)
circuit.C('2', 'Wien', 'Vmid', 10 @ u_nF)
# Behavioral non-inverting amplifier: gain slightly above 3 for startup.
# The VCVS output is referenced to Vmid by adding a 2.5 V DC offset.
circuit.VCVS('A', 'Araw', circuit.gnd, 'Wien', 'Vmid', 3.1)
circuit.V('offset', 'Vdrive', 'Araw', 2.5 @ u_V)
circuit.R('5', 'Vdrive', 'Vout', 100 @ u_Ω)
# Output amplitude clamps to the supply rails
circuit.model('clamp_d', 'D', IS=1e-14, N=1)
circuit.D('1', circuit.gnd, 'Vout', model='clamp_d')
circuit.D('2', 'Vout', 'Vdd', model='clamp_d')
simulator = circuit.simulator()
