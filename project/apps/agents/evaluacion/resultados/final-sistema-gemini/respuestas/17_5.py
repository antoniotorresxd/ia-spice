from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vcc 0 DC 2.5\nVee 0 vee DC 2.5\nRA vout fb 10k\nRB fb 0 4.7k\nR1 n1 0 1k\nR2 fb n2 1k\nDX1 fb vout DIODE_1N4148\nDX2 0 fb DIODE_1N4148\nX1 n2 fb vout vcc vee opamp_ideal\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vout', 'n1', '159n')
circuit.C('2', 'n2', '0', '159n')
circuit.raw_spice += '.subckt opamp_ideal inp inn out vcc vee\nRin inp inn 1e9\nEgain n_int 0 inp inn 1e5\nEout out 0 n_int 0 1\n.ends\n.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)'
simulator = circuit.simulator()
