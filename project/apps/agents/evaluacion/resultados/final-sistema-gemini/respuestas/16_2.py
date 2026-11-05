from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vdd 0 DC 5.0\nVEE 0 vee DC 5.0\nX1 0 vminus vout OPAMP\nRf vout vminus 470k\nRin vminus v1 10k\nR1 v2 0 10k\nR2 v3 0 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'v1', 'v2', '10n')
circuit.C('2', 'v2', 'v3', '10n')
circuit.C('3', 'v3', 'vout', '10n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin_op inp inn 1meg\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
