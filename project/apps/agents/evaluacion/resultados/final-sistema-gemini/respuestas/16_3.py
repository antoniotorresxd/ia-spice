from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5.0\nVEE 0 vee DC 5.0\nX1 0 vminus Vout opamp_ideal\nRf Vout vminus 470k\nR1 vminus vn1 10k\nR2 vn1 vn2 10k\nR3 vn2 Vout 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vn1', '0', '10n')
circuit.C('2', 'vn2', '0', '10n')
circuit.C('3', 'Vout', '0', '10n')
circuit.raw_spice += '.subckt opamp_ideal inp inn out\nRin inp inn 1e9\nEgain n1 0 inp inn 1e6\nRp n1 n2 100\nCp n2 0 1e-9\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
