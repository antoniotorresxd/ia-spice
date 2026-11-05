from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin Vin 0 DC 0 PULSE(-2 2 0 10m 10m 20m 40m)\nR1 Vin vminus 10k\nR2 vout vminus 10k\nR3 vplus 0 10k\nR4 vplus vout 100k\nVcc vcc 0 DC 5.0\nVee vee 0 DC 0\nX1 vplus vminus vout vcc vee opamp_lim\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp_lim inp inn out vcc vee\nEout out 0 TABLE {(v(inp)-v(inn))*1e5} = (-0.001, 0) (0.001, 5.0)\n.ends'
simulator = circuit.simulator()
