from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin Vin 0 DC 0 AC 1 SIN(0 1 1k)\nRin Vin vx 1.6k\nRf vminus Vout 16k\nX1 0 vminus Vout opamp\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vx', 'vminus', '10n')
circuit.raw_spice += '.subckt opamp inp inn out\nRin1 inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 1.59n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
