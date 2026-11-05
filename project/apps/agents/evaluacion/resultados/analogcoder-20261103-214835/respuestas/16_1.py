from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nX1 0 vminus vout opamp\nRf vminus vout 330k\nRin 0 vminus 10k\nR1 vout n1 10k\nR2 n1 n2 10k\nR3 n2 vminus 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'n1', '0', '15.9n')
circuit.C('2', 'n2', '0', '15.9n')
circuit.C('3', 'vminus', '0', '15.9n')
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
