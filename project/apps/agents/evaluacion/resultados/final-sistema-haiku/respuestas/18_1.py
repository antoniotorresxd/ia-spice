from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin Vin 0 DC 0 AC 1 SIN(0 0.1 1k)\nR1 Vin vminus 1.6k\nRf vminus Vout 1meg\nEOP Vout 0 0 vminus 1e5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('f', 'vminus', 'Vout', '10n')
circuit.raw_spice += ''
simulator = circuit.simulator()
