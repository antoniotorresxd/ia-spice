from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 5\nVEE vee 0 -5\nV1 Vin1 0 1\nV2 Vin2 0 0\nRin1 Vin1 nsum 33k\nRin2 Vin2 nsum 33k\nRf Vout nsum 33k\nX1 0 nsum Vout OPAMP vcc=5 vee=-5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
