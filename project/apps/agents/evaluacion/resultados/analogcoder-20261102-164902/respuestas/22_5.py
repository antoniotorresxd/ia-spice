from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
circuit = Circuit('Non-Inverting Schmitt Trigger')
# Supply and DC input
circuit.V('dd', 'Vdd', circuit.gnd, 5.0)
circuit.V('in', 'Vin', circuit.gnd, 3.5)
# 2.5 V reference divider
circuit.R('ref_top', 'Vdd', 'Vref', 10@u_kΩ)
circuit.R('ref_bottom', 'Vref', circuit.gnd, 10@u_kΩ)
# Non-inverting Schmitt-trigger input and positive feedback
circuit.R('in', 'Vin', 'Vplus', 100@u_kΩ)
circuit.R('fb', 'Vout', 'Vplus', 470@u_kΩ)
# Idealized high-gain op-amp stage
circuit.VCVS(
    'Aop',
    'Vraw',
    circuit.gnd,
    'Vplus',
    'Vref',
    voltage_gain=1e5
)
# Output isolation and rail clamps
circuit.R('out', 'Vraw', 'Vout', 100@u_Ω)
circuit.model('Dclamp', 'D', is_=1e-14, n=1)
circuit.D('clamp_low', circuit.gnd, 'Vout', model='Dclamp')
circuit.D('clamp_high', 'Vout', 'Vdd', model='Dclamp')
simulator = circuit.simulator()
