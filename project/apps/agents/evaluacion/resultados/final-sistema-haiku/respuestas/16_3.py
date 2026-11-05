from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nX1 n_p n_m Vout OPAMP\nRf Vout n_m 47k\nRg n_m 0 1k\nR1 Vout n1 3.9k\nR2 n1 n2 3.9k\nR3 n2 n3 3.9k\nR4 n3 n_m 3.9k\nRbias n_p 0 100k\n.ic v(Vout)=0.01\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'n1', '0', '16.6387n')
circuit.C('2', 'n2', '0', '16.6387n')
circuit.C('3', 'n3', '0', '16.6387n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e9\nEgain nint 0 inp inn 1e5\nRo nint out 100\n.ends'
simulator = circuit.simulator()
