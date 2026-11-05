from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5\nRBIAS1 vdd vref 10k\nRBIAS2 vref 0 10k\nR1 nw wien 16k\nR2 wien vref 16k\nRG ninv vref 10k\nRF Vout ninv 22k\nD1 Vout ninv DCLAMP\nD2 ninv Vout DCLAMP\nXU1 wien ninv Vout vdd 0 OP5\nVKICK kick 0 PULSE(0 10m 1m 1u 1u 1m 1)\nRkick kick wien 1meg\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('REF', 'vref', '0', '100u')
circuit.C('1', 'Vout', 'nw', '10n')
circuit.C('2', 'wien', 'vref', '10n')
circuit.raw_spice += '.model DCLAMP D(IS=2.52n N=1.752 RS=0.568)\n.subckt OP5 inp inn out vdd vss\nBAMP out 0 V=limit(0.5*(V(vdd)+V(vss))+1e5*(V(inp)-V(inn)),V(vss)+0.2,V(vdd)-0.2)\n.ends OP5'
simulator = circuit.simulator()
