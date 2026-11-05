from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVIN1 vin1 0 1\nVIN2 vin2 0 1\nR1 vin1 vm 10k\nR2 vin2 vm 10k\nRf vm vout 10k\nX1 0 vm vout OPAMP\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
