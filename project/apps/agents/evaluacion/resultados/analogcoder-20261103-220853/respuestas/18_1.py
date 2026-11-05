from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin vin 0 DC 0 AC 1 PULSE(-1 1 0 10n 10n 0.5m 1m)\nRin vin vminus 19340.6593\nRf vminus vout 193406.5934\nX1 0 vminus vout opamp\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('f', 'vminus', 'vout', '1.2155e-08')
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
