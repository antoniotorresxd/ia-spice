from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nRf Vout nfb 300k\nRin nfb 0 10k\nX1 0 nfb Vout OPAMP\nR1 n1 0 6.8k\nR2 n2 0 6.8k\nR3 nfb 0 6.8k\n.ic v(Vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vout', 'n1', '9.55932n')
circuit.C('2', 'n1', 'n2', '9.55932n')
circuit.C('3', 'n2', 'nfb', '9.55932n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 1n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
