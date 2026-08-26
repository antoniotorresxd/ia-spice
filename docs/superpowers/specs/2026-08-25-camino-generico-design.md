# El camino genérico — Diseño

Fecha: 2026-08-25
Estado: aprobado, listo para plan de implementación

## El problema

Hoy el sistema resuelve cualquier solicitud **que caiga en su catálogo**, y el
catálogo son cuatro topologías. Pedirle un Sallen-Key, un espejo de corriente o
un emisor común termina en `llm_extraction_failed`: el esquema tiene cuatro
`Literal` y el LLM no tiene a qué mapear lo demás.

Eso contradice la ambición del proyecto —que una descripción en lenguaje natural
se resuelva sola— y contradice los límites de la tesina, que prometen
inductores, transistores y operacionales.

## La observación que lo hace posible

El pipeline se parte en dos mitades con propiedades muy distintas:

| Componente | ¿Depende de conocer la topología? |
|---|---|
| Orquestador (interpretar) | No — es el LLM |
| **Cálculo** (fórmulas cerradas) | **Sí**, una por tipo |
| **Escritura** (constructores) | **Sí**, uno por tipo |
| Shell (ngspice) | No — le da igual el circuito |
| **Reglas de ajuste** | **Sí**, una por tipo |
| Recompensa y política del curador | **No** |

El lazo ya es general. `R = -Σᵢ(wᵢ·APEᵢ) + β·c - γ·n` no sabe si mide un divisor
o un filtro de segundo orden: opera sobre error relativo, convergencia e
iteración. Lo único cableado es el medio determinista.

**Entonces no hace falta rediseñar el sistema, sino abrir un segundo camino
hacia el mismo lazo.**

## La decisión

Los dos caminos conviven:

```
prompt → ¿cae en el catálogo?
         ├── sí → ecuación exacta → netlist determinista  ─┐
         └── no → LLM genera el netlist (con recuperación)─┤
                                                           ├→ ngspice → curador ⟲
                          ajuste: el LLM corrige el netlist ┘
                          dado el error que ngspice midió
```

**Lo que NO cambia, y es lo que sostiene la propuesta:** ngspice sigue siendo el
árbitro. El netlist que produce el LLM no se acepta por plausible; se simula, se
mide y se compara contra la meta. La diferencia con los trabajos del estado del
arte que generan netlists con un LLM no es que nosotros generemos mejor, es que
nosotros no nos creemos lo generado.

**El RAG mejora la generación, no la verificación.** Conviene decirlo así en el
documento: recuperar la ecuación de un Sallen-Key hace que el modelo alucine
menos, pero un netlist recuperado y adaptado sigue siendo plausible-no-
comprobado. La comprobación la sigue haciendo la simulación. Confundir las dos
cosas es el error que la tesina le critica al estado del arte.

## Por qué esto mejora la tesina, no solo la agranda

Con los dos caminos se pueden medir **tres brazos** sobre el mismo banco:

1. **Curado** — ecuación exacta + lazo
2. **Genérico** — LLM + recuperación + lazo
3. **Best-of-N** — LLM sin lazo (la línea base que el objetivo 6 ya exige)

Eso responde dos preguntas distintas con el mismo experimento:

- **¿Cuánto aporta el lazo?** → 2 contra 3
- **¿Cuánto aporta el conocimiento determinista?** → 1 contra 2

La segunda comparación no la reporta ninguno de los trabajos revisados en el
estado del arte, y sale casi gratis una vez montado el camino genérico.

## Cómo encaja en la arquitectura actual

Sin cirugía mayor. El bloque genérico lleva su netlist en `params`, y el netlist
viaja por el mismo canal que hoy llevan los valores de los componentes:

- **Esquema** — un `GenericBlock` con `id`, `type: "generic"`, y en `params`:
  `description` (para el ajuste y la recuperación), `metric`, `target` y
  `netlist` (completo, con su bloque `.control` que escribe `output.txt`).
- **Orquestador** — `_normalize` toma la meta de `params` en lugar de `_GOALS`.
- **Cálculo** — `FORMULAS["generic"]` no calcula nada: deja pasar el netlist a
  `component_values[block_id]["netlist"]`.
- **Escritura** — `NETLIST_BUILDERS["generic"]` devuelve `values["netlist"]`.
  `escritura_node` ya recibe `params` y `values`, así que no cambia.
- **Shell** — **no cambia**. Ejecuta ngspice y lee un escalar, sin saber de dónde
  salió el netlist.
- **Curador** — el ajuste se bifurca: los tipos curados usan sus reglas
  deterministas; el genérico le pide al LLM un netlist corregido, dándole el
  actual, la meta y lo que ngspice midió.
- **Recompensa y política** — **no cambian**.

El único cambio estructural es que `curador_node` pase a recibir el
`RunnableConfig`, para poder resolver el LLM del usuario. Ojo con el detalle
conocido: LangGraph solo inyecta el config si el segundo parámetro está anotado
como `RunnableConfig`; tiparlo `dict` devuelve `None` en silencio.

## La degradación, explícita

Sin LLM configurado el camino genérico no existe: el orquestador no puede
interpretar lenguaje natural y el ajuste genérico no puede corregir. Eso ya es
así hoy para el camino de `request_text`. Lo importante es que **falle diciendo
qué falta**, no que se cuelgue: si un bloque genérico llega al ajuste sin LLM
disponible, el curador rechaza con un motivo legible.

El camino curado sigue funcionando sin ningún modelo, y las 20 corridas del
banco de evaluación siguen siendo deterministas y repetibles.

## La recuperación, en dos etapas

**Etapa 1 — corpus curado, sin vector store.** Un archivo de topologías con
netlist de referencia, ecuaciones de diseño y qué métrica se mide en cada una.
Se seleccionan por coincidencia de términos y se inyectan como ejemplos en el
prompt. Da la mayor parte del beneficio sin infraestructura.

**Etapa 2 — recuperación semántica.** Embeddings sobre el mismo corpus, para
que "filtro de segundo orden con Q alto" encuentre el Sallen-Key aunque no
comparta palabras. Se construye encima de la etapa 1 y se puede **medir contra
ella**: si la recuperación semántica no mejora la tasa de acierto sobre la
léxica, eso también es un resultado publicable.

Este orden es deliberado: la etapa 1 deja el sistema abierto y funcionando; la
etapa 2 lo mejora. Si el tiempo aprieta, se entrega con la etapa 1 y la 2 queda
como trabajo futuro con datos que la justifican.

## Fuera de alcance

- **Componentes reales de catálogo** (hojas de datos, valores E12/E24). El
  sistema sigue emitiendo valores continuos.
- **Topologías multietapa conectadas.** Un bloque genérico es un circuito
  completo e independiente, como los demás.
- **Reentrenar o afinar el modelo.** Solo contexto.

## Criterio de terminado

1. Una solicitud fuera del catálogo —un filtro Sallen-Key -3 dB en 1 kHz— entra
   en lenguaje natural, produce un netlist, lo simula en ngspice y termina con
   veredicto.
2. Un bloque genérico cuya primera medición cae fuera de tolerancia se ajusta al
   menos una vez y mejora, con la traza en `history`.
3. Sin LLM configurado, un bloque genérico termina con un veredicto legible que
   dice qué falta, no con una excepción.
4. El camino curado no cambia de comportamiento: las 20 corridas del banco dan
   el mismo MAPE que hoy.
5. La evaluación reporta los tres brazos por separado.

## Lo que hay que escribir en la tesina

El RAG **no aparece hoy en el documento**; su única mención está en la tabla del
estado del arte describiendo el trabajo de otro equipo. Incorporarlo obliga a
tocar: estado del arte (situar la recuperación frente a los trabajos revisados),
marco teórico (qué es y qué no resuelve), objetivos específicos, límites y
alcances, y la propuesta de solución. No es un párrafo.
