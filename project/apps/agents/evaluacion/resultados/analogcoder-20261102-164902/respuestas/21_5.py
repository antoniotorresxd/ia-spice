from PySpice.Unit import *
from PySpice.Spice.Netlist import Circuit
circuit = Circuit('CMOS Op-Amp Subtractor')
# MOSFET models
circuit.model('nmos_model', 'nmos', level=1, kp=100e-6, vto=0.5)
circuit.model('pmos_model', 'pmos', level=1, kp=50e-6, vto=-0.5)
# Supplies, input operating-point values, and PMOS bias
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in1', 'Vin1', circuit.gnd, 2.0)
circuit.V('in2', 'Vin2', circuit.gnd, 3.0)
circuit.V('bp', 'VBP', circuit.gnd, 4.0)
# Matched subtractor resistors: Vout = Vin2 - Vin1
circuit.R('1', 'Vin1', 'Vminus', 100e3)
circuit.R('2', 'Vout', 'Vminus', 100e3)
circuit.R('3', 'Vin2', 'Vplus', 100e3)
circuit.R('4', 'Vplus', circuit.gnd, 100e3)
# First stage: PMOS differential pair
# Bulk terminals are tied to the corresponding source nodes.
circuit.MOSFET(
    'P1', 'NREF', 'Vminus', 'PT', 'PT',
    model='pmos_model', w=40e-6, l=2e-6
)
circuit.MOSFET(
    'P2', 'N1', 'Vplus', 'PT', 'PT',
    model='pmos_model', w=40e-6, l=2e-6
)
# PMOS tail-current source
circuit.MOSFET(
    'P5', 'PT', 'VBP', 'Vdd', 'Vdd',
    model='pmos_model', w=20e-6, l=2e-6
)
# NMOS current-mirror active load
circuit.MOSFET(
    'M3', 'NREF', 'NREF', circuit.gnd, circuit.gnd,
    model='nmos_model', w=20e-6, l=2e-6
)
circuit.MOSFET(
    'M4', 'N1', 'NREF', circuit.gnd, circuit.gnd,
    model='nmos_model', w=20e-6, l=2e-6
)
# Second stage: NMOS common-source amplifier with PMOS current-source load
circuit.MOSFET(
    'M6', 'Vout', 'N1', circuit.gnd, circuit.gnd,
    model='nmos_model', w=20e-6, l=2e-6
)
circuit.MOSFET(
    'P7', 'Vout', 'VBP', 'Vdd', 'Vdd',
    model='pmos_model', w=10e-6, l=2e-6
)
# DC paths for the simplified Level-1 MOS model
circuit.R('bleed_n1', 'N1', circuit.gnd, 10e6)
circuit.R('bleed_out', 'Vout', 'Vdd', 10e6)
# Miller compensation capacitor
circuit.C('comp', 'N1', 'Vout', 10e-12)
simulator = circuit.simulator()
