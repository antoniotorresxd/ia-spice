from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5\nRREF1 vdd VREF 10k\nRREF2 VREF 0 10k\nVSIG Vin 0 PWL(0 0 1m 0 6m 5 12m 5 18m 0 20m 0)\nRIN Vin VP 40k\nRFB Vout VP 100k\nBOP Vout 0 V=2.5+2.5*tanh(1e4*(V(VP)-V(VREF)))\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
