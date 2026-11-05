from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nX1 vp vm vout OPAMP\nR1 vout vs 10k\nR2 vp 0 10k\nRf vout vm 10k\nR4 vm 0 4.7k\nD1 vout vm DMOD\nD2 vm vout DMOD\n.ic v(vout)=0.01\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vs', 'vp', '10n')
circuit.C('2', 'vp', '0', '10n')
circuit.raw_spice += '.subckt OPAMP inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 100\nCp n2 0 1.5n\nEout out 0 n2 0 1\n.ends\n.model DMOD D(IS=1e-16)'
simulator = circuit.simulator()
