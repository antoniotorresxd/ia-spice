from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nV1 Vin1 0 DC 0 AC 1\nV2 Vin2 0 DC 0 AC 0\nVDD VDD 0 5\nVEE VEE 0 -5\nR1 Vin1 vm 10k\nR2 Vout vm 10k\nR3 Vin2 vp 10k\nR4 vp 0 10k\nX1 vp vm Vout OPAMP vcc=5 vee=-5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += ''
simulator = circuit.simulator()
