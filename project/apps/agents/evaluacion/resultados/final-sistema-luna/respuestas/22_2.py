from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 5.0\nVIN Vin 0 PULSE(0 5 0 5m 5m 10m 30m)\nRIN Vin Vplus 33k\nRF Vout Vplus 82k\nRREF1 Vdd Vref 10k\nRREF2 Vref 0 10k\nBOP Vout 0 V=limit(1e6*(V(Vplus)-V(Vref))+2.5,0,5)\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
