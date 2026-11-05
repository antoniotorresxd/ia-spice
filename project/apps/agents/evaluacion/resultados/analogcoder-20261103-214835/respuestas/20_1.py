from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin1 vin1 0 DC 1.2155\nVin2 vin2 0 DC 2.431\nR1 vin1 vminus 12155.0625\nR2 vin2 vminus 12155.0625\nRf vminus vout 12160\nX1 0 vminus vout opamp\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
