from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin Vin 0 DC 0 PULSE(-2 2 0 10m 10m 20m 40m)\nVdd vcc 0 DC 5.0\nVee vee 0 DC 0.0\nR1 Vin vplus 10k\nR2 vplus Vout 91k\nR_ref vminus 0 10k\nX1 vplus vminus Vout vcc vee opamp_schmitt\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp_schmitt inp inn out vcc vee\nEout out_ideal 0 inp inn 1e5\nEclamp out 0 VALUE { if(V(out_ideal)>V(vcc), V(vcc), if(V(out_ideal)<V(vee), V(vee), V(out_ideal)) ) }\n.ends'
simulator = circuit.simulator()
