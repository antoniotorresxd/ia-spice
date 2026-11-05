from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vcc 0 DC 12\nVEE vee 0 DC -12\nX1 0 vn vout opamp\nRf vout vn 33k\nR1 vn 0 1k\nR2 vc 0 1k\nR4 vb 0 1k\n.ic v(vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('3', 'vc', 'vn', '10n')
circuit.C('1', 'vb', 'vc', '10n')
circuit.C('2', 'vout', 'vb', '10n')
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 1n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
