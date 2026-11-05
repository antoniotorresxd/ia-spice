from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5.0\nVINPUT - 0 DC 0\nRC vdd vc 22k\nRE ve 0 1k\nQ1 vc vb ve QNPN\nR1 n1 0 6.8k\nR2 n2 0 6.8k\nR3 nb 0 6.8k\nRB3 vdd nb 16k\nRB4 nb 0 100k\nQ2 vdd nb vb QNPN\nRE2 vb 0 33k\nRLOAD Vout 0 100k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('E', 've', '0', '100u')
circuit.C('1', 'vc', 'n1', '10.47n')
circuit.C('2', 'n1', 'n2', '10.47n')
circuit.C('3', 'n2', 'nb', '10.47n')
circuit.C('OUT', 'vc', 'Vout', '10u')
circuit.raw_spice += '.model QNPN NPN(BF=100 VAF=100 IS=6.7f)'
simulator = circuit.simulator()
