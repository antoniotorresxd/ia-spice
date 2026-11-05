from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 5\nVEE vee 0 -5\nVIN1 Vin1 0 1\nVIN2 Vin2 0 0\nR1 Vin1 n 10k\nR2 Vin2 n 10k\nRF n Vout 10k\nX1 0 n Vout OPAMP vcc=5 vee=-5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
