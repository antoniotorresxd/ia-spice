from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 DC 5\nVREF1 Vdd Vref 10k\nVREF2 Vref 0 10k\nVsig Vin 0 DC 2.5 AC 1 SIN(2.5 10m 100)\nR1 Vin Nminus 100k\nRf Vout Nminus 1meg\nBOP Vout 0 V=2.5+2.5*tanh(40000*(V(Vref)-V(Nminus)))\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('f', 'Vout', 'Nminus', '100n')
circuit.raw_spice += ''
simulator = circuit.simulator()
