from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 DC 5\nRIN - 0 1meg\nRB1 Vdd B 10k\nRB2 B 0 1meg\nRC Vdd Vout 10k\nRE E 0 10k\nQ1 Vout B E QN3904\nR1 N1 0 10k\nR2 N2 0 10k\nR3 B 0 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('E', 'E', '0', '100u')
circuit.C('1', 'Vout', 'N1', '11n')
circuit.C('2', 'N1', 'N2', '11n')
circuit.C('3', 'N2', 'B', '11n')
circuit.raw_spice += '.model QN3904 NPN(IS=6.734f BF=200 VAF=74.03 CJE=4.493p CJC=3.638p TF=301.2p TR=239.5n)'
simulator = circuit.simulator()
