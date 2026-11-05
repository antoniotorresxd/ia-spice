from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vdd 0 DC 5.0\nRC vdd vout 1.2k\nQ1 vout base emit NPN_MODEL\nRB1 vdd base 56k\nRB2 base 0 18k\nRE emit 0 100\nR1 n1 base 10k\nR2 n2 0 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('E', 'emit', '0', '47u')
circuit.C('1', 'vout', 'n1', '15n')
circuit.C('2', 'n1', 'n2', '15n')
circuit.C('3', 'base', 'n2', '15n')
circuit.raw_spice += '.model NPN_MODEL NPN(BF=400 VAF=100)'
simulator = circuit.simulator()
