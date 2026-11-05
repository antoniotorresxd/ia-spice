from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD VDD 0 DC 5\nRUP VDD Vref 10k\nRDN Vref 0 10k\nVSIG Vin 0 DC 2.5 AC 1\nR1 Vin Vminus 100k\nRf Vminus Vout 1meg\nXU1 Vref Vminus Vout VDD OP5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('f', 'Vminus', 'Vout', '10n')
circuit.raw_spice += '.subckt OP5 INP INM OUT VPOS\nBAMP OUT 0 V=limit(2.5+1e5*(V(INP)-V(INM)),0.05,V(VPOS)-0.05)\n.ends OP5'
simulator = circuit.simulator()
