from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vdd 0 5.0\nVEE 0 vee 5.0\nX1 net_in net_out Vout opamp_ideal\nR1 net_in vx 10k\nR2 0 vx 10k\nRf Vout net_in 20k\nRg net_in 0 10k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'vx', '0', '10n')
circuit.C('2', 'Vout', 'vx', '10n')
circuit.raw_spice += '.subckt opamp_ideal inp inn out\nE1 out 0 value={1e5*(v(inp)-v(inn))}\n.ends'
simulator = circuit.simulator()
