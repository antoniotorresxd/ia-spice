from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nVss vss 0 DC -5\nR1 Vout n1 16k\nR2 Vplus 0 16k\nRf Vout Vminus 20k\nRg Vminus 0 10k\nX1 Vplus Vminus Vout OPAMP\n.ic v(Vout)=0.01\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'n1', 'Vplus', '10n')
circuit.C('2', 'Vplus', '0', '10n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159p\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
