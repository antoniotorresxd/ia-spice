from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVin Vin 0 PULSE(-3 3 0 10m 10m 10m 20m)\nR1 Vin vplus 10k\nR2 vplus Vout 100k\nX1 vplus 0 Vout VCC VEE OPAMP\nV1 VCC 0 5.0\nV2 VEE 0 -5.0\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.raw_spice += '.subckt OPAMP inp inn out vcc vee\nRin inp inn 1e9\nEgain n1 0 inp inn 1e5\nRp n1 n2 100\nCp n2 0 1u\nEout out_unlimited 0 n2 0 1\nEclamp out 0 VALUE { if(V(out_unlimited) > V(vcc), V(vcc), if(V(out_unlimited) < V(vee), V(vee), V(out_unlimited))) }\n.ends'
simulator = circuit.simulator()
