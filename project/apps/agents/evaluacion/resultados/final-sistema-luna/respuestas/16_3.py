from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 DC 5\nRIN - 0 1000meg\nRB1 Vdd B 33k\nRB2 B 0 15k\nRC Vdd Vout 3.3k\nRE E 0 680\nQ1 Vout B E QN\nR1 N1 0 1k\nR2 N2 0 1k\nR3 B 0 1k\n.ic V(N1)=1m\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('E', 'E', '0', '100u')
circuit.C('1', 'Vout', 'N1', '100n')
circuit.C('2', 'N1', 'N2', '100n')
circuit.C('3', 'N2', 'B', '100n')
circuit.raw_spice += '.model QN NPN(IS=1e-14 BF=100 VAF=100)'
simulator = circuit.simulator()
