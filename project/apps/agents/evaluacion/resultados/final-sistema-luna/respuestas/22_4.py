from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5.0\nVINPUT Vin 0 PWL(0 0 1m 5 2m 0 3m 5)\nRIN Vin vp 1.2k\nRF Vout vp 2.4k\nRREF1 vdd vref 1.2k\nRREF2 vref 0 1.2k\nBOP Vout 0 V=limit(1e5*(V(vp)-V(vref)),0,5)\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
