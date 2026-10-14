"""Análisis de redes lineales: nodos, mallas, reducción y Thévenin/Norton.

A diferencia del camino de diseño (requisitos -> componentes), aquí el
circuito ya existe y la pregunta es qué corrientes y tensiones tiene. El LLM
solo transcribe la red a un netlist; las ecuaciones, la reducción y la
solución son deterministas (sympy), y ngspice resuelve la misma red por su
lado para validar que las dos respuestas coinciden.
"""
