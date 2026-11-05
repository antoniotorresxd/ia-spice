from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vdd 0 DC 5.0\nVEE vee 0 DC 0\nX1 vminus vplus vout vdd vee opamp\nR1 vout vminus 12k\nR2 vminus 0 10k\nR3 n1 vplus 10k\nR4 n2 vplus 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vout', 'n1', '100n')
circuit.C('2', 'n1', 'n2', '100n')
circuit.C('3', 'n2', '0', '100n')
circuit.raw_spice += '.subckt opamp inn inp out vcc vee\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out_unclipped 0 n2 0 1\nAclp out_unclipped 0 out vcc vee 0 0 0 limit\n.ends\n.model limit ddt_limit(gain=1 vout_max=5 vout_min=0)'
simulator = circuit.simulator()
