from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD VDD 0 DC 5\nVREF VREF 0 DC 2.5\nVstim Vin 0 PULSE(0 5 1m 1m 1m 10m 20m)\nRin Vin vp 39k\nRf Vout vp 100k\nBcmp Vout 0 V=V(VDD)*(1+tanh(1e4*(V(vp)-V(VREF))))/2\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
