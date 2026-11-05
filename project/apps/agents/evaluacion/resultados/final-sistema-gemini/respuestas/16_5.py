from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vdd 0 DC 5.0\nVEE vee 0 DC -5.0\nRf vout vminus 330k\nRin vminus 0 10k\nR1 n1 0 10k\nR2 n2 0 10k\nR3 vin 0 10k\nX1 0 vminus vout opamp\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vminus', 'n1', '100n')
circuit.C('2', 'n1', 'n2', '100n')
circuit.C('3', 'n2', 'vin', '100n')
circuit.raw_spice += '.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
