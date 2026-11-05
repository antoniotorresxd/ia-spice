from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVIN1 Vin1 0 {VIN1}\nVIN2 Vin2 0 {VIN2}\nR1 Vin1 nminus 10k\nRF Vout nminus 10k\nR3 Vin2 nplus 10k\nR4 nplus 0 10k\nX1 nplus nminus Vout OPAMP vcc=5 vee=0\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
