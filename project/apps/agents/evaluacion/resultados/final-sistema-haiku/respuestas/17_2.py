from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nX1 vplus vminus Vout vdd 0 OPAMP\nR1 Vout n1 10k\nR2 vplus 0 10k\nRf Vout vminus 20k\nRg vminus 0 10k\n.ic v(Vout)=0.01\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'n1', 'vplus', '15.9n')
circuit.C('2', 'vplus', '0', '15.9n')
circuit.raw_spice += '.subckt OPAMP inp inn out vcc vee\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 1n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
