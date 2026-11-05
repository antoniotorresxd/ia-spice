from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nX1 vplus vminus Vout opamp\nR1 vplus node1 16k\nR2 0 node1 16k\nRf Vout vminus 20k\nRg vminus 0 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'node1', '0', '10n')
circuit.C('2', 'Vout', 'vplus', '10n')
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
