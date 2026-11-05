from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vcc 0 DC 5.0\nVEE 0 vee DC 5.0\nR1 vout feedback 10k\nRf feedback 0 24k\nR2 n1 0 1k\nX1 feedback - vout vcc vee opamp\nRload vout 0 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'feedback', 'n1', '159n')
circuit.C('2', 'vout', 'n1', '159n')
circuit.raw_spice += '.subckt opamp inp inn out vcc vee\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
