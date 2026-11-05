from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin vin 0 DC 2.5\nVCC vdd 0 DC 5.0\nVEE vee 0 DC 0\nR1 vin vplus 10k\nR2 vplus vout 100k\nR3 vplus 0 10k\nX1 0 vplus vout vdd vee opamp_model\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp_model inp inn out vcc vee\nEout out 0 TABLE {v(inp,inn)} (-0.0001, 0.0) (0.0001, 5.0)\n.ends'
simulator = circuit.simulator()
