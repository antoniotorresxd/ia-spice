from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD VDD 0 DC 5\nRREF1 VDD Vref 10k\nRREF2 Vref 0 10k\nR1 nw plus 31.6k\nR2 plus Vref 31.6k\nRF Vout - 21k\nRG - Vref 10k\nX1 plus - Vout VDD 0 OPAMP5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vout', 'nw', '5n')
circuit.C('2', 'plus', 'Vref', '5n')
circuit.raw_spice += '.subckt OPAMP5 inp inn out vdd vss\nBOUT out 0 V = (V(vdd)+V(vss))/2 + ((V(vdd)-V(vss))/2 - 0.1)*tanh(1e5*V(inp,inn))\n.ends OPAMP5'
simulator = circuit.simulator()
