from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vcc 0 DC 15\nVEE vee 0 DC -15\nX1 vp vn vout OPAMP\nR2 vp 0 10k\nR3 vf vout 10k\nRg vn 0 10k\nRf vn vout 22k\n.ic v(vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vp', '0', '15.9n')
circuit.C('2', 'vp', 'vf', '15.9n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159p\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
