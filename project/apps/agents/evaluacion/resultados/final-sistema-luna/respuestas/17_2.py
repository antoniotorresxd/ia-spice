from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 DC 5\nVREF Vref 0 DC 2.5\nR1 n1 p 16k\nR2 p Vref 16k\nRf Vout nminus 22k\nRg nminus Vref 10k\nXU p nminus Vout Vref OPAMP\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vout', 'n1', '9.88235n')
circuit.C('2', 'p', 'Vref', '10n')
circuit.raw_spice += '.SUBCKT OPAMP inp inn out vref\nBOUT out vref V=2.4*tanh(10000*V(inp,inn))\n.ENDS OPAMP'
simulator = circuit.simulator()
