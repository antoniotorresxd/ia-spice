## Sistema + anthropic/claude-haiku-5.5

| Tarea | Tipo | Pasan | Pass@1 | Pass@5 | Escalones | Pasan adapt. | Pass@1 adapt. | AnalogCoder P@1 | GPT-4o solo P@1 |
|---|---|---|---|---|---|---|---|---|---|
| 16 | Oscillator | 1/5 | 20.0 | 100.0 | pasa 1, no_funciona 4 | 4/5 | 80.0 | 6.7 | 0.0 |
| 17 | Oscillator | 3/5 | 60.0 | 100.0 | pasa 3, no_funciona 2 | 3/5 | 60.0 | 0.0 | 0.0 |
| 18 | Integrator | 0/5 | 0.0 | 0.0 | no_funciona 4, interfaz 1 | 3/5 | 60.0 | 100.0 | 0.0 |
| 19 | Differentiator | 0/5 | 0.0 | 0.0 | no_funciona 5 | 4/5 | 80.0 | 60.0 | 0.0 |
| 20 | Adder | 0/5 | 0.0 | 0.0 | no_simula 5 | 0/5 | 0.0 | 100.0 | 0.0 |
| 21 | Subtractor | 4/5 | 80.0 | 100.0 | pasa 4, no_simula 1 | 4/5 | 80.0 | 20.0 | 0.0 |
| 22 | Schmitt | 0/5 | 0.0 | 0.0 | sin_codigo 3, no_simula 2 | 0/5 | 0.0 | 0.0 | 0.0 |

Verificador original: tareas resueltas al menos una vez 3/7 · Pass@1 medio 22.9 %
Verificador adaptado: tareas resueltas al menos una vez 5/7 · Pass@1 medio 51.4 %
