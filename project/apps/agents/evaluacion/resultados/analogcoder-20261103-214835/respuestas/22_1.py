from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin vin 0 SIN(0 2 1000)\nR1 vin vplus 10k\nR2 vplus vout 27k\nR3 vplus 0 10k\nX1 vplus 0 vout opamp\nVcc vcc 0 5\nVee vee 0 -5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
