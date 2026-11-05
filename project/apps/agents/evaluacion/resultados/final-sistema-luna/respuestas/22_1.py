from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd VDD 0 DC 5\nVin Vin 0 PWL(0 0 10m 5 20m 0)\nRin Vin vp 10k\nRfb Vout vref 47k\nRref1 VDD vref 10k\nRref2 vref 0 10k\nBop Vout 0 V=if(V(vp)>V(vref),5,0)\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
