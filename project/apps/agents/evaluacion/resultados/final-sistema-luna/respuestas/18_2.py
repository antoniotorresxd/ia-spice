from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5\nVSS vss 0 DC 0\nRREF1 vdd vref 10k\nRREF2 vref 0 10k\nVSIG Vin 0 SIN(0 10m 1k) AC 1\nR1 Vin nminus 10k\nRBIAS vdd nminus 10k\nRf nminus Vout 1meg\nXU1 vref nminus Vout vdd vss OPAMP\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('f', 'nminus', 'Vout', '20n')
circuit.raw_spice += '.subckt OPAMP inp inn out vp vn\nBOUT out 0 V=limit(1e6*(V(inp)-V(inn)), V(vn)+0.1, V(vp)-0.1)\n.ends OPAMP'
simulator = circuit.simulator()
