from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 DC 5.0\nVsig Vin 0 DC 2.5 AC 1\nRref1 Vdd Vref 100k\nRref2 Vref 0 100k\nR1 Vin Nminus 16k\nRf Vout Nminus 160k\nXU1 Vref Nminus Vdd 0 Vout opamp5\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('ref', 'Vref', '0', '10u')
circuit.C('f', 'Vout', 'Nminus', '100n')
circuit.raw_spice += '.subckt opamp5 inp inn vdd vee out\nBdrv Ndrv 0 V=limit(1e5*(V(inp)-V(inn))+2.5,V(vee)+0.1,V(vdd)-0.1)\nRout Ndrv out 50\n.ends opamp5'
simulator = circuit.simulator()
