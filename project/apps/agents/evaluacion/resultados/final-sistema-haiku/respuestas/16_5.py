from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5.0\nVss vss 0 DC -5.0\nR1 n1 0 3.6k\nR2 n2 0 3.6k\nR3 - 0 3.6k\nRf Vout - 110k\nX1 0 - Vout OPAMP\n.ic v(Vout)=0.01\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vout', 'n1', '18n')
circuit.C('2', 'n1', 'n2', '18n')
circuit.C('3', 'n2', '-', '18n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e9\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 1p\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
