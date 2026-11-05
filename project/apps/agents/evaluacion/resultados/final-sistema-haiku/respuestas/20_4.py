from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVIN1 Vin1 0 1\nVIN2 Vin2 0 1\nR1 Vin1 vminus 10k\nR2 Vin2 vminus 10k\nRF vminus Vout 10k\nX1 0 vminus Vout OPAMP a=1e5 rd=1meg ro=100\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
