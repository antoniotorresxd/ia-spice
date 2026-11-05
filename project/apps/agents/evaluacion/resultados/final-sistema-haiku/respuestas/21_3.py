from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin1 Vin1 0 DC 1\nVin2 Vin2 0 DC 2\nR1 Vin1 vminus 10k\nR2 vminus Vout 10k\nR3 Vin2 vplus 10k\nR4 vplus 0 10k\nX1 vplus vminus Vout OPAMP\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
