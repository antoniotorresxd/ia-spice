# Resolver el 50 % de los problemas del Franco — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Meta:** que el sistema resuelva, con verificación de ngspice, al menos el 50 % de los problemas de fin de capítulo de *Design with Operational Amplifiers and Analog Integrated Circuits* (S. Franco, 4.ª ed., 2015). El PDF lo tiene el usuario; se consulta por páginas sueltas (desfase PDF = impresa + 17) y **no se copia su texto al repo**: el banco guarda paráfrasis propias y referencias "Franco P1.4".

**Diagnóstico (muestreo de los capítulos 1–3):** casi todo cae en cuatro capacidades que hoy faltan:

1. **Op-amps y fuentes controladas.** Op-amp ideal y con `a`, `r_d`, `r_o` finitos; fuentes E/G/F/H. Hoy `leer_red` solo acepta R, L, C y fuentes independientes, y con P1.4 el LLM inventó los valores de las incógnitas.
2. **Incógnitas, escenarios y condiciones.** Problemas inversos (P1.1–1.5), "encuentra R₂ tal que…" (P1.13b), rangos con potenciómetro (P1.9, P1.12), barridos de `a` (P1.11).
3. **Dominio s.** H(s), polos/ceros, H₀/ω₀/Q, Bode verificado con `.ac` (todo el cap. 3–4, parte del 6 y 8).
4. **Figuras.** La mayoría de los enunciados dicen "en el circuito de la Fig. P2.7": sin imágenes de entrada no llegan al sistema.

Capítulos 1–6 ≈ la mitad del libro y caen casi completos con 1–4 más los modelos no ideales del op-amp (fase 6). Del 9 al 13 (no lineales, generadores, convertidores, PLL) quedan fuera de esta meta.

## Arquitectura

Un **motor simbólico** nuevo, `agents/analisis/simbolico.py`, al lado del análisis actual (que se queda para mallas, reducción paso a paso y Thévenin de redes pasivas):

- **MNA en el dominio s** con sympy. Elementos: R, L (`sL`), C (`1/sC`), V, I, E (VCVS), G (VCCS), F (CCCS), H (CCVS) y op-amp `X<n> <in+> <in-> <out> OPAMP [a=… rd=… ro=…]` (sin parámetros = ideal: nulator-norator; con `a` = VCVS interna más `r_d` y `r_o`). Es el mismo orden de pines que ya usa el catálogo (`X1 vplus vminus vout opamp`), así el visualizador lo dibuja.
- **Valores numéricos o simbólicos** (`{Ri}`), sustituibles por escenario.
- **Planteamiento**: `incognitas`, `escenarios` (valores + mediciones/condiciones) y `tareas` (`valor` de una expresión como `V(o)` o `I(RL)`, `transferencia` V(out)/fuente → H(s) en forma estándar con polos, ceros, H₀, ω₀, Q y datos de Bode, `impedancia` entre dos nodos). Las condiciones de todos los escenarios forman un sistema que se resuelve para las incógnitas; las tareas se evalúan con lo resuelto.
- **Verificación con ngspice** por escenario: el op-amp ideal se simula como VCVS de ganancia 1e9; la H(s) se contrasta contra un barrido `.ac` en varias frecuencias; las condiciones se comprueban con los valores encontrados.
- **Entrada al grafo**: el mismo modo `analysis`. `AnalysisOutcome` gana campos opcionales (`incognitas`, `escenarios`, `tareas`); `analisis_node` despacha al motor simbólico cuando vienen esos campos o la red trae elementos que el análisis pasivo no acepta. El server y el cliente ya manejan este modo.
- **Bode** viaja en `sim_results` con `curve`/`analysis_type: "ac"` para que la pestaña de curva lo dibuje.

## Fases

- [ ] **Fase 0 — Banco del Franco.** `evaluacion/franco/` con ~5 problemas por capítulo 1–6, como planteamientos estructurados transcritos por nosotros más la respuesta esperada (derivada a mano y contrastada). Un corredor mide la cobertura por capítulo. Es la línea base y la métrica de la tesina.
- [ ] **Fase 1 — Guía: no inventar incógnitas.** Si los propios componentes son incógnitas, el LLM no les pone valores (hasta la fase 3, responde por chat con el planteamiento).
- [ ] **Fase 2 — Motor simbólico: elementos.** Lector extendido (E/G/F/H/OPAMP, valores `{simbolo}`), MNA en s, tarea `valor` en DC, verificación ngspice. Casos: P1.6, P1.7, P1.11, P1.15, P1.16.
- [ ] **Fase 3 — Incógnitas y escenarios.** Sistema de condiciones → incógnitas; tareas evaluadas con lo resuelto; rangos (potenciómetro como `{k}·R` con `k∈[0,1]`). Casos: P1.1–P1.5, P1.9, P1.13.
- [ ] **Fase 4 — Dominio s.** Tarea `transferencia`: forma estándar, polos/ceros, H₀/ω₀/Q, Bode y verificación `.ac`. Casos: cap. 3 (P3.4, P3.5, P3.8, P3.13, P3.14) y filtros KRC/MFB del cap. 3–4.
- [ ] **Fase 5 — Orquestador e informe.** Schema y guía para que el LLM produzca planteamientos (no números inventados); informe Markdown+LaTeX con secciones; Bode en `sim_results`; símbolos E/G/F/H en el visualizador.
- [ ] **Fase 6 — Op-amp no ideal.** `a(s) = a₀/(1+s/ω_b)` (GBP), `V_OS`, `I_B`/`I_OS` como fuentes; ganancia de lazo y margen de fase. Capítulos 5, 6 y 8.
- [ ] **Fase 7 — Imágenes de entrada.** Adjuntar la figura en el chat; el orquestador la recibe como contenido multimodal y transcribe; se muestra el netlist transcrito para revisarlo.

Cada fase: TDD, commit directo en `dev`, **sin push** hasta que el usuario lo diga, y re-medición con el banco.
