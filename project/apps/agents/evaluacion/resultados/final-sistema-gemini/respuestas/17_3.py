from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVCC vdd 0 DC 5.0\nVEE 0 vee DC 5.0\nX1 inn_op Vout Vout vdd vee opamp\nR1 inn_op 0 10k\nRf Vout inn_op 24k\nR2 n_mid 0 16k\nR3 Vout n_mid 16k\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('1', 'inn_op', 'n_mid', '10n')
circuit.C('2', 'Vout', 'n_mid', '10n')
circuit.raw_spice += '.subckt opamp inp inn out vcc vee\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends'
simulator = circuit.simulator()
