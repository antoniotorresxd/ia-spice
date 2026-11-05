## Sistema + google/gemini-3.5-flash-lite

| Tarea | Tipo | Pasan | Pass@1 | Pass@5 | Escalones | Pasan adapt. | Pass@1 adapt. | AnalogCoder P@1 | GPT-4o solo P@1 |
|---|---|---|---|---|---|---|---|---|---|
| 16 | Oscillator | 0/5 | 0.0 | 0.0 | no_funciona 5 | 1/5 | 20.0 | 6.7 | 0.0 |
| 17 | Oscillator | 0/5 | 0.0 | 0.0 | no_funciona 5 | 0/5 | 0.0 | 0.0 | 0.0 |
| 18 | Integrator | 0/5 | 0.0 | 0.0 | no_funciona 5 | 5/5 | 100.0 | 100.0 | 0.0 |
| 19 | Differentiator | 0/5 | 0.0 | 0.0 | no_funciona 5 | 5/5 | 100.0 | 60.0 | 0.0 |
| 20 | Adder | 5/5 | 100.0 | 100.0 | pasa 5 | 5/5 | 100.0 | 100.0 | 0.0 |
| 21 | Subtractor | 5/5 | 100.0 | 100.0 | pasa 5 | 5/5 | 100.0 | 20.0 | 0.0 |
| 22 | Schmitt | 0/5 | 0.0 | 0.0 | no_simula 4, no_funciona 1 | 0/5 | 0.0 | 0.0 | 0.0 |

Verificador original: tareas resueltas al menos una vez 2/7 · Pass@1 medio 28.6 %
Verificador adaptado: tareas resueltas al menos una vez 5/7 · Pass@1 medio 60.0 %
