from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 5\nVS1 Vin1 0 1\nVS2 Vin2 0 2\nR1 Vin1 nminus 10k\nR2 Vout nminus 10k\nR3 Vin2 nplus 10k\nR4 nplus 0 10k\nX1 nplus nminus Vout OPAMP vcc=5 vee=0\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
