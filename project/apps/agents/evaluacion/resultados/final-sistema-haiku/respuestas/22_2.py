from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 5\nVin Vin 0 DC 0\nR1 Vout vp 10k\nR2 vp 0 10k\nRf Vout vp 100k\nX1 vp vn Vout OPAMP\nRg vn 0 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
