from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nVss vss 0 DC -5\nR1 n1 0 10k\nR2 n2 0 10k\nRg nm 0 10k\nRf Vout nm 300k\nX1 0 nm Vout vdd vss OPAMP\n.ic v(Vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vout', 'n1', '10n')
circuit.C('2', 'n1', 'n2', '10n')
circuit.C('3', 'n2', 'nm', '10n')
circuit.raw_spice += ".subckt OPAMP inp inn out vp vn\nRin inp inn 1e6\nBout out 0 V='max(v(vn),min(v(vp),1e5*(v(inp)-v(inn))))'\n.ends"
simulator = circuit.simulator()
