from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin1 vin1 0 DC 0\nVin2 vin2 0 DC 0\nR1 vin1 vminus 10k\nRf1 vminus vout 10k\nR2 vin2 vplus 10k\nRf2 vplus 0 10k\nX1 vplus vminus vout OPAMP\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
