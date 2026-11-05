from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVDD Vdd 0 DC 5\nRBIAS1 Vdd Vref 10k\nRBIAS2 Vref 0 10k\nVin Vin 0 DC 2.5 AC 1 SIN(2.5 0.1 1k)\nRin ncap nminus 1.6k\nRf Vout nminus 16k\nX1 Vref nminus ndrv OPAMP\nRout ndrv Vout 75\nDHI Vout Vdd DCLAMP\nDLO 0 Vout DCLAMP\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'Vin', 'ncap', '10n')
circuit.raw_spice += '.model DCLAMP D(IS=1e-14 N=1)\n.subckt OPAMP inp inn out\nRinop inp inn 1meg\nGGAIN 0 n2 inp inn 1\nRGAIN n2 0 100k\nCGAIN n2 0 15.9n\nEOUT out 0 n2 0 1\n.ends OPAMP'
simulator = circuit.simulator()
