from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nV1 Vin1 0 1\nV2 Vin2 0 0\nR1 Vin1 nsum 10k\nR2 Vin2 nsum 10k\nRf nsum Vout 10k\nX1 0 nsum Vout OPAMP vcc=5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
