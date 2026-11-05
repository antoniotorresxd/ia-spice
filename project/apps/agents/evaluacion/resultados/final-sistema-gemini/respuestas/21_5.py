from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVp vin2 0 DC 0.6078\nVn vin1 0 DC -0.6078\nR1 vin1 vminus 12155.0625\nR2 vminus vout 12160\nR3 vin2 vplus 12155.0625\nR4 vplus 0 12160\nX1 vplus vminus vout opamp\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
