from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nVss vss 0 DC -5\nR1 n1 0 4.7k\nR2 n2 0 4.7k\nR3 n3 nin 4.7k\nRf Vout nin 150k\nRg nin 0 4.7k\nX1 0 nin Vout OPAMP\n.ic v(Vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vout', 'n1', '10.22n')
circuit.C('2', 'n1', 'n2', '10.22n')
circuit.C('3', 'n2', 'n3', '10.22n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 15.9n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
