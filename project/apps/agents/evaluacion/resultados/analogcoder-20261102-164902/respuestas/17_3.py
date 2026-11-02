from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('Wien Bridge Oscillator')
# NMOS model
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
# Diode model for output amplitude limiting
circuit.model('dlim', 'D', is_=1e-14, n=1)
# Supplies and midpoint reference
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('ref', 'Vref', circuit.gnd, 2.5)
# Wien bridge: series R-C from Vout to W,
# and parallel R-C from W to Vref
circuit.R('bridge_series', 'Vout', 'BridgeRC', 10e3)
circuit.C('bridge_series', 'BridgeRC', 'W', 10e-9)
circuit.R('bridge_parallel', 'W', 'Vref', 10e3)
circuit.C('bridge_parallel', 'W', 'Vref', 10e-9)
circuit.R('gate_bias', 'W', 'Vref', 1e6)
# First common-source stage
circuit.MOSFET(
    '1', 'N1', 'W', 'S1', 'S1',
    model='nmos_model', w=100e-6, l=10e-6
)
circuit.R('source1', 'S1', circuit.gnd, 1e3)
circuit.R('drain1', 'N1', 'Vdd', 3.3e3)
# Second common-source stage
circuit.MOSFET(
    '2', 'Vout', 'N1', 'S2', 'S2',
    model='nmos_model', w=100e-6, l=10e-6
)
circuit.R('source2', 'S2', circuit.gnd, 1e3)
circuit.R('drain2', 'Vout', 'Vdd', 3.3e3)
# Antiparallel output-clamping diodes for amplitude stabilization
circuit.D('limit1', 'Vout', 'Vref', model='dlim')
circuit.D('limit2', 'Vref', 'Vout', model='dlim')
simulator = circuit.simulator()
