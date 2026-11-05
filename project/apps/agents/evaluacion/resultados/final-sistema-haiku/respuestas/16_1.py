from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nVss vss 0 DC -5\nX1 vp vminus vout OPAMP\nRp vp 0 10k\nR1 n1 0 6.8k\nR2 n2 0 6.8k\nR3 vminus 0 6.8k\nRf vminus vout 200k\n.ic v(vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vout', 'n1', '9.55932n')
circuit.C('2', 'n1', 'n2', '9.55932n')
circuit.C('3', 'n2', 'vminus', '9.55932n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nEout out 0 n1 0 1\n.ends'
simulator = circuit.simulator()
