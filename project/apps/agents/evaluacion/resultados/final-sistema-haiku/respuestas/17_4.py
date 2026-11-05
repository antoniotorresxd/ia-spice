from PySpice.Spice.Netlist import Circuit
from PySpice.Unit import *
from PySpice.Spice.Parser import SpiceParser
_netlist = '.title circuito\nVdd vdd 0 DC 5\nVss vss 0 DC -5\nEop Vout 0 n_plus n_minus 1e5\nRs1 Vout n_a {Rw}\nRp1 n_plus 0 {Rw}\nR1 n_minus 0 {R1}\nRf Vout n_minus {Rf}\n.ic v(Vout)=0.01\n.end\n'
circuit = SpiceParser(source=_netlist).build_circuit()
circuit.C('s1', 'n_a', 'n_plus', '{Cw}')
circuit.C('p1', 'n_plus', '0', '{Cw}')
circuit.raw_spice += '.param Cw=9.9472n\n.param Rw=16k\n.param R1=10k\n.param Rf=20k'
simulator = circuit.simulator()
