from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nVss vss 0 DC -5\nR1 vplus 0 10k\nR2 vf vplus 10k\nRf vout vminus 22k\nRg vminus 0 10k\nX1 vplus vminus vout vdd vss opamp\n.ic v(vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vout', 'vf', '15.9n')
circuit.C('2', 'vplus', '0', '15.9n')
circuit.raw_spice += '.subckt opamp inp inn out vp vn\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 1n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
