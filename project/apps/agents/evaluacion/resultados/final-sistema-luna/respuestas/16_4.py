from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5\nRIN - 0 1000meg\nRC vdd Vout 4.7k\nRB1 vdd b 39k\nRB2 b 0 15k\nRE e 0 1k\nR1 n1 0 10k\nR2 n2 0 10k\nR3 b 0 1000meg\nQ1 Vout b e QN\n.ic V(n1)=1m\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vout', 'n1', '10n')
circuit.C('2', 'n1', 'n2', '10n')
circuit.C('3', 'n2', 'b', '10n')
circuit.raw_spice += '.model QN NPN(BF=100 IS=1e-14 VAF=100)'
simulator = circuit.simulator()
