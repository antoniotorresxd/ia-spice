from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vcc 0 DC 5.0\nVEE 0 vee DC 5.0\nRf vout vminus 20k\nRg vminus 0 10k\nR1 vplus vx 10k\nR2 vout vx 10k\nX1 vplus vminus vout vcc vee opamp_model\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vx', '0', '15.9n')
circuit.C('2', 'vout', 'vx', '15.9n')
circuit.raw_spice += '.subckt opamp_model inp inn out vcc vee\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
