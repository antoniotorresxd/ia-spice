from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin Vin 0 DC 0 PULSE(-3 3 0 1m 1m 5m 10m)\nRin Vin Vp 1meg\nR1 Vp 0 9.1k\nRf Vout Vp 100k\nX1 Vp Vm Vout OPAMP\nRm Vm 0 1k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 VALUE={MAX(-12,MIN(12,V(n2)))}\n.ends'
simulator = circuit.simulator()
