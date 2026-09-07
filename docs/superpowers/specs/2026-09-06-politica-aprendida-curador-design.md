# Política aprendida del curador — Diseño

Fecha: 2026-09-06
Estado: aprobado, listo para plan de implementación

## El problema

El objetivo general de la tesina compromete un "ecosistema multiagente basado en LLM y
**aprendizaje por refuerzo**", y el objetivo específico 4 es explícito: "Desarrollar el
agente curador, **basado en aprendizaje por refuerzo**, que decide si una propuesta de
circuito se acepta, se ajusta o se rechaza con base en las métricas devueltas por la
simulación." `propuesta_solucion.tex` va más lejos y describe una garantía de fiabilidad
concreta: "El curador dispone de una decisión determinista por reglas como respaldo de
su política, de modo que el sistema produce siempre una decisión aunque **la política
aprendida** no resulte aplicable."

El código de `agents/curador/policy.py` no tiene ninguna política aprendida. Es
puramente heurístico: `estimate_action_rewards` calcula la recompensa de cada acción con
una fórmula fija, `choose_action` compara esos números y no hay ningún `train`,
`update`, `learn` ni pesos persistidos en ningún lado. La tesina describe una capacidad
que el sistema no tiene.

## La observación que lo hace posible

Mirando `estimate_action_rewards` con cuidado, no las tres acciones están en la misma
situación:

| Acción | ¿Su recompensa es exacta o estimada? |
|---|---|
| `accept` | Exacta — `compute_reward` sobre mediciones reales de ngspice |
| `reject` | Exacta — una constante de configuración (`reject_reward`) |
| `adjust` | **Estimada** — proyecta `APE_actual × ρ`, donde ρ es un factor fijo de configuración o, cuando hay historial, la razón observada entre las dos últimas iteraciones |

Solo `adjust` es una proyección, y ya lo es hoy con una heurística burda (`ρ` fijo o
extrapolado de dos puntos). **Ese es el único lugar del curador donde "aprender" tiene
sentido**: no hace falta rediseñar `accept`/`reject`, que ya son exactos y no se
benefician de nada aprendido. El resto del curador —evaluación de bloques, gate de
tolerancia (`accept_is_admissible`), reglas de ajuste por tipo de circuito
(`ADJUST_RULES`)— no cambia.

Además, `curador/node.py` ya registra en `history` justo lo que hace falta para
entrenar: cada `record` trae `weighted_ape`, `converged`, `iteration`, `action_rewards`
y `decision`. El propio código ya lo anticipa (comentario en `node.py` línea ~106): "OJO
si algún día se entrena una política con este historial: para armar tuplas (estado,
acción, recompensa) hay que tomar la entrada de `action_rewards` que corresponda a
`decision`, no este campo."

## La decisión

Un **bandit contextual**: un modelo de regresión que predice la recompensa esperada de
`adjust` a partir de features del estado, entrenado sobre recompensas *realizadas* (no
proyectadas) observadas en corridas reales del grafo. Se eligió sobre Q-learning
tabular porque:

- Necesita mucha menos data para converger (decenas–cientos de episodios, no miles).
- No requiere discretizar el estado en bins, una decisión de diseño extra que sesga el
  resultado y hay que justificar aparte.
- Es interpretable (coeficientes), lo que importa para el capítulo de resultados.
- Cada decisión del curador ya se trata como un problema de un paso (dado el estado,
  ¿qué acción rinde más?), no como una cadena donde el valor de una acción depende del
  valor de estados futuros lejanos — que es exactamente cuándo Q-learning aporta sobre
  un bandit y aquí no aporta, porque el horizonte es corto (`max_iterations`, default 5).

**Etiquetado de recompensa realizada.** Para una iteración `i` con `decision="adjust"`,
la recompensa que hoy se proyecta con `APE × ρ` tiene, en el propio dataset de
entrenamiento, un valor *real* disponible: es la recompensa de `accept` que el registro
`i+1` calculó sobre el estado ya ajustado (el campo `reward` de ese registro, que
`node.py` ya iguala a `action_rewards["accept"]"`). No hace falta instrumentar nada
nuevo para observarla — ya está en `history`, solo hay que persistirla entre corridas.

**Corpus de entrenamiento: sintético, con exploración forzada.** Hoy no existe ningún
historial persistido entre corridas (`history` vive y muere dentro de un solo
`invoke()`). Generarlo esperando tráfico real dejaría el sistema sin nada que "aprender"
para la defensa de la tesina. En su lugar, un generador corre el grafo real —ngspice de
verdad, sin mocks, mismo principio que el banco de evaluación— sobre specs variados
dentro del catálogo actual (`voltage_divider`, `rc_lowpass`, `led_resistor`,
`noninverting_amp`), con una política de comportamiento que, con probabilidad ε, fuerza
una acción distinta a la que elegiría la heurística. Sin esa exploración forzada, el
dataset solo contendría las decisiones que la heurística ya tomaría y el bandit
aprendería a clonarla, no a mejorarla — no habría nada que aprender.

**Radio de daño acotado y reajuste seguro.** El bandit no toca al LLM del orquestador ni
al curador genérico; solo reemplaza una proyección numérica dentro de
`estimate_action_rewards`. Los pesos entrenados son un artefacto versionado, igual que
`curador.yaml`, producido por un script de entrenamiento explícito —nunca se entrena en
caliente en producción—. Antes de que unos pesos nuevos reemplacen a los actuales, se
corren los mismos 20 casos del banco de evaluación con la política nueva: si el MAPE o
la tasa de circuitos dentro de tolerancia empeora contra la heurística vigente, esos
pesos no se despliegan. Esto convierte el reentrenamiento en un proceso con el mismo
gate de calidad que ya protege al camino curado.

## Cómo encaja en la arquitectura actual

- **`agents/evaluacion/entrenamiento/generar_dataset.py`** (nuevo) — corre `build_graph()`
  repetidamente sobre specs generados (dentro del catálogo, valores iniciales/metas/
  semillas de ruido variados), con la política de comportamiento descrita arriba
  (heurística + exploración ε). Persiste el `history` completo de cada episodio a un
  dataset JSONL versionado.
- **`agents/curador/entrenamiento.py`** (nuevo) — lee el dataset, arma los pares
  `(features_i, recompensa_realizada_de_adjust)` a partir de registros consecutivos,
  ajusta la regresión y serializa los pesos a `config/curador_politica.json` (mismo
  patrón externo-a-código que `curador.yaml`).
- **`agents/curador/policy.py`** — `estimate_action_rewards` gana un parámetro opcional
  `adjust_reward_estimator: Callable[[dict], float] | None`. Si está presente y el
  estado cae dentro de lo que el modelo vio en entrenamiento (mismo tipo de circuito,
  features en rango), se usa su predicción para la recompensa de `adjust` en vez de
  `APE × ρ`. Si no —sin pesos cargados, tipo de circuito no cubierto, features fuera de
  rango, o cualquier error al evaluar el modelo— se cae a la proyección actual, que pasa
  a ser explícitamente el "respaldo determinista" que la tesina promete.
  `choose_action` no cambia: sigue comparando las mismas tres recompensas, sin importar
  de dónde salió la de `adjust`.
- **`agents/config.py`** — nueva entrada opcional (ej. `CURADOR_POLICY_PATH`) para
  ubicar el artefacto de pesos, con el mismo criterio de degradación explícita que
  `CHECKPOINTER_URL`: sin ella, el curador funciona igual que hoy.
- **Gate de evaluación** — reusa `agents/evaluacion/{banco,corredor,metricas,reporte}.py`
  tal cual existen; el criterio de reemplazo de pesos se implementa como un script que
  corre el banco dos veces (heurística pura vs. política nueva) y compara.

## La degradación, explícita

Sin `CURADOR_POLICY_PATH` configurado, o si el estimador aprendido lanza cualquier
excepción, o si el estado no cae dentro de lo cubierto por el entrenamiento, el curador
se comporta exactamente como hoy: proyección `APE × ρ`. El camino curado sigue siendo
determinista y repetible en el banco de evaluación cuando corre sin política aprendida.

## Fuera de alcance

- **Aprender el "cuánto ajustar"** (reemplazar `ADJUST_RULES`). Las fórmulas por tipo de
  circuito ya son exactas o casi exactas; no hay ganancia y sí una superficie de riesgo
  mucho mayor (acciones continuas, no discretas).
- **Entrenamiento online** durante corridas de producción o del banco de evaluación. Los
  pesos se cargan congelados; entrenar es un paso explícito y separado.
- **Feedback conversacional del usuario** (likes/dislikes, correcciones en lenguaje
  natural sobre una conversación) como señal de entrenamiento. Es un mecanismo distinto
  —subjetivo, entre conversaciones, sin meta numérica verificable por simulación— que
  queda como un diseño separado a futuro, no se mezcla con esta política.
- **Q-learning o cualquier variante que modele explícitamente la cadena de iteraciones**
  dentro de una corrida. Ver la justificación del bandit arriba.
- **Corpus RAG de topologías de referencia** (spec `2026-08-25-camino-generico-design.md`,
  etapa 1). Es un tema relacionado —ambos son "el sistema aprende algo"— pero
  arquitectónicamente independiente: el RAG mejora la generación de netlists genéricos,
  esto mejora la decisión del curador. No se resuelven en el mismo trabajo.

## Criterio de terminado

1. Existe un dataset sintético generado con el grafo real (ngspice real) que incluye
   episodios con exploración forzada, no solo trayectorias de la heurística.
2. El script de entrenamiento produce un artefacto de pesos versionado a partir de ese
   dataset, reproducible (misma semilla → mismos pesos).
3. Con `CURADOR_POLICY_PATH` apuntando a esos pesos, el banco de 20 casos corre y
   produce un MAPE y una tasa de circuitos dentro de tolerancia iguales o mejores que
   con la heurística sola; si empeora, el criterio de terminado no se cumple y los pesos
   no se consideran aptos para reemplazar el respaldo.
4. Sin `CURADOR_POLICY_PATH`, o con un estado fuera de lo cubierto por el entrenamiento,
   el curador decide exactamente igual que hoy (mismo MAPE, misma tasa) — la
   degradación es real, no solo declarada.
5. `estimate_action_rewards` tiene pruebas unitarias para ambos caminos (con estimador
   aprendido mockeado, y sin él) sin invocar ngspice.

## Lo que hay que corregir en la tesina

`propuesta_solucion.tex` y `marco_teorico.tex` ya describen esta capacidad en tiempo
presente ("el curador dispone de...", "en su variante con aprendizaje, ajusta su
política"). Una vez implementado esto, esas secciones quedan correctas tal como están
escritas — no hace falta reescribirlas, a diferencia de los hallazgos B2/B3
(topología multietapa) que sí exigen reescribir texto porque describen algo que se
decidió no construir.
