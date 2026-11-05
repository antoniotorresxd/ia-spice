from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nVee vee 0 DC -5\nR1 Vout n1 10k\nR2 nplus 0 10k\nRf Vout nminus 22k\nRg nminus 0 10k\nD1 Vout nminus DMOD\nD2 nminus Vout DMOD\nX1 nplus nminus Vout vdd vee OPAMP\n.ic v(Vout)=0.1\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'n1', 'nplus', '10n')
circuit.C('2', 'nplus', '0', '10n')
circuit.raw_spice += '.model DMOD D(IS=1e-14 N=1.4)\n.subckt OPAMP inp inn out vdd vee\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 1p\nEout out 0 value={min(max(v(n2),-4.5),4.5)}\n.ends'
simulator = circuit.simulator()
