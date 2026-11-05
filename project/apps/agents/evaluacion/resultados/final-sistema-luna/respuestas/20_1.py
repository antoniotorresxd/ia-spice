from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nV1 Vin1 0 DC 1\nV2 Vin2 0 DC 1\nVDD Vdd 0 DC 5\nVEE Vee 0 DC -5\nRin1 Vin1 nsum 10k\nRin2 Vin2 nsum 10k\nRf Vout nsum 10k\nEOP Vout 0 nsum 0 1e5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
