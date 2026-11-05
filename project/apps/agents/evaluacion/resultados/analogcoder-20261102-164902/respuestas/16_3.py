from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('RC Phase-Shift Oscillator')
# NPN transistor model
circuit.model('npn_model', 'npn', IS=1e-14, BF=120, VAF=100)
# Supply
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
# Common-emitter amplifier bias and load
circuit.R('C', 'Vdd', 'Vout', 10@u_kΩ)
circuit.R('E', 'E', circuit.gnd, 1@u_kΩ)
circuit.C('E_bypass', 'E', circuit.gnd, 100@u_uF)
circuit.R('bias_top', 'Vdd', 'B', 470@u_kΩ)
circuit.R('bias_bottom', 'B', circuit.gnd, 100@u_kΩ)
# NPN common-emitter stage: collector, base, emitter
circuit.BJT('1', 'Vout', 'B', 'E', model='npn_model')
# Three-section RC phase-shift feedback network
circuit.C('1', 'Vout', 'N1', 10@u_nF)
circuit.C('2', 'N1', 'N2', 10@u_nF)
circuit.C('3', 'N2', 'B', 10@u_nF)
circuit.R('1', 'N1', circuit.gnd, 10@u_kΩ)
circuit.R('2', 'N2', circuit.gnd, 10@u_kΩ)
circuit.R('3', 'B', circuit.gnd, 10@u_kΩ)
simulator = circuit.simulator()
