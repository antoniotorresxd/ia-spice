from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 DC 5\nR1 Vout n1 10k\nR2 n1 n2 10k\nR3 n2 - 10k\nRB1 Vdd - 470k\nRB2 - 0 180k\nRC Vdd Vout 6.8k\nRE emitter 0 2.2k\nQ1 Vout - emitter QNPN\n.ic V(Vout)=2.5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'n1', '0', '100n')
circuit.C('2', 'n2', '0', '100n')
circuit.C('3', '-', '0', '100n')
circuit.C('E', 'emitter', '0', '470u')
circuit.raw_spice += '.model QNPN NPN(BF=300 VAF=100 IS=1e-14)'
simulator = circuit.simulator()
