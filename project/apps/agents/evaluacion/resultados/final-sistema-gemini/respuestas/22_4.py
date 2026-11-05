from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vdd 0 DC 5.0\nVEE vee 0 DC -5.0\nVin vin 0 SIN(0 0.5 1000)\nR1 vin vplus 10k\nR2 vplus vout 20k\nX1 vplus 0 vout vdd vee opamp\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp inp inn out vcc vee\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
