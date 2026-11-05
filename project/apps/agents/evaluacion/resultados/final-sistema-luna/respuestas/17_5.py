from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD vdd 0 DC 5\nRBIAS1 vdd vref 10k\nRBIAS2 vref 0 10k\nRw1 nseries wp 10k\nRw2 wp vref 10k\nRF Vout - 22k\nRG - vref 10k\nD1 Vout - DCLAMP\nD2 - Vout DCLAMP\nXU1 wp - Vout OPAMP5\n.ic V(Vout)=2.501 V(nseries)=2.5 V(wp)=2.5 V(vref)=2.5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('BIAS', 'vref', '0', '100u')
circuit.C('w1', 'Vout', 'nseries', '10n')
circuit.C('w2', 'wp', 'vref', '10n')
circuit.raw_spice += '.model DCLAMP D(IS=2.52n N=1.75 RS=0.6)\n.subckt OPAMP5 inp inn out\nBAMP nraw 0 V=2.5+2.3*tanh(1e5*(V(inp)-V(inn))/2.3)\nROUT nraw out 0.1\n.ends OPAMP5'
simulator = circuit.simulator()
