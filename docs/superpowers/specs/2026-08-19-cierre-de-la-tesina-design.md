# El cierre de la tesina — Diseño de la iteración

Fecha: 2026-08-19
Estado: aprobado, listo para planes de implementación

## Objetivo

Cerrar la brecha entre lo que la tesina promete y lo que el sistema hace, para entregar una
solución funcional que sostenga los seis objetivos específicos. La auditoría de partida es
[`docs/auditoria-tesina-vs-codigo.md`](../../auditoria-tesina-vs-codigo.md), que levanta 24
hallazgos; esta iteración los resuelve.

La iteración anterior ("el puente de generación") conectó la interfaz con el pipeline. Esta
construye lo que falta para que el pipeline sea el sistema que la tesina describe: un curador con
decisión formalizada sobre una función de recompensa, un circuito no trivial con macromodelo, y la
evaluación experimental que el objetivo específico 6 exige.

## Decisiones tomadas

Cuatro decisiones de alcance, tomadas explícitamente antes de planear, que determinan el tamaño
del trabajo.

**1. Los sub-bloques siguen siendo independientes; se añade un amplificador no inversor con
macromodelo de operacional.** No se implementa topología multietapa con nodos de conexión. El
catálogo pasa de tres circuitos triviales a cuatro, con uno que introduce macromodelo, realimentación
y ganancia — el ejemplo que el propio marco teórico usa. La tesina se reescribe para hablar de
sub-bloques independientes en lugar de circuitos de varias etapas.

*Por qué:* la topología real redisearía el esquema, la escritura, el shell y el curador a la vez,
y no aporta a ningún objetivo específico que no cubra ya el Master-Worker. El macromodelo, en
cambio, cubre el hallazgo C1 y da un circuito con el que la evaluación tiene sentido.

**2. El curador formaliza el MDP y decide por recompensa, sin política aprendida.** Se implementa
la función de recompensa exactamente como la define el marco teórico, se registra en el historial,
y la decisión aceptar/ajustar/rechazar sale de comparar la recompensa esperada de cada acción. Las
reglas actuales quedan como respaldo determinista.

*Por qué:* el propio marco teórico lo autoriza —*"el interés de este marco no es entrenar una
política sobre un entorno arbitrario, sino formalizar la decisión que toma el curador"*— y es la
lectura honesta de lo que se puede construir y evaluar en el tiempo disponible. La política
aprendida queda registrada como trabajo futuro con el `history` ya persistido como dataset.

**3. El cálculo es híbrido: el LLM propone y la fórmula verifica.** El agente de cálculo pide al
LLM los valores de los componentes con las ecuaciones de diseño en contexto, y contrasta la
propuesta contra la fórmula cerrada. Si la desviación supera un umbral configurable, gana la
fórmula y se registra la discrepancia.

*Por qué:* sostiene la afirmación del marco teórico (el LLM interviene en dos puntos) sin sacrificar
fiabilidad, y produce una métrica publicable para el capítulo de resultados: **qué tan seguido
acierta el modelo por su cuenta**. Es un dato que ningún trabajo del estado del arte reporta a este
nivel y refuerza el argumento de por qué la verificación externa hace falta.

**4. Entran las tres piezas de infraestructura**: contenedor Docker, *checkpointer* sobre Postgres
y API keys de usuario. Las tres son afirmaciones que la tesina ya da por hechas, y dos de ellas
sostienen controles del capítulo de seguridad.

## Fuera de alcance, deliberadamente

- **Topología multietapa con nodos de conexión** y la fase Reduce que la verifica (hallazgos B2 y
  B3). Se resuelve reescribiendo la tesina.
- **Política de RL aprendida** (bandit, Q-learning). El `history` con recompensa queda como dataset.
- **Inductores y transistores.** El catálogo llega hasta el operacional por macromodelo.
- **Análisis transitorio.** Ninguno de los cuatro circuitos lo requiere.
- **Instrumentación de consumo** (tokens, costo, tiempo). La pantalla de inicio se recorta en la
  tesina en lugar de conectarse (hallazgo E1).
- **Balanceador de cargas y réplicas.** El contenedor habilita el argumento; desplegarlo no es
  parte de esta iteración.

## Vocabulario

- **APE** — error porcentual absoluto de un parámetro: `|simulado - objetivo| / |objetivo| · 100`.
- **Recompensa `R`** — el escalar que resume la calidad de una iteración, según la fórmula del
  marco teórico.
- **Acción** — una de `accept`, `adjust`, `reject`.
- **Convergencia `c`** — vale 1 si ngspice resolvió el circuito, 0 si falló o no convergió.
- **Bloque** — un sub-circuito independiente con su propia meta. No comparte nodos con otros.

---

## Diseño por fase

Las fases están ordenadas por dependencia. La Fase 1 es la ruta crítica: todo lo demás la necesita.

### Fase 1 — El curador formalizado

Resuelve los hallazgos A1, A3, A4, A5 y D4. Es la aportación central de la tesina y hoy no existe.

**Configuración externa** (`apps/agents/config/curador.yaml`, cargado por `agents/config.py`).
Los pesos por métrica, `beta`, `gamma`, la recompensa de rechazo, el factor de reducción esperado
por ajuste, `max_iterations`, `tolerance`, el piso de resistencia y el factor de perturbación salen
del código y entran a un archivo. La ruta se puede sobreescribir con `CURADOR_CONFIG_PATH` para que
los experimentos usen configuraciones distintas sin tocar el repositorio.

**Métricas enriquecidas.** `sim_results` pasa de `{metrics, sim_error}` a
`{metrics, converged, sim_error}`, y `metrics` deja de ser un escalar único para admitir varias
entradas por bloque. Es lo que permite que la variable `c` de la fórmula tenga de dónde salir y que
`Σᵢ` sea una suma real.

**La recompensa** (`agents/curador/reward.py`), función pura:

```
R = -Σᵢ (wᵢ · APEᵢ) + β·c - γ·n
```

**La política** (`agents/curador/policy.py`). El curador estima la recompensa de cada acción
disponible y elige la mayor:

- `R_accept` — la recompensa del estado actual.
- `R_adjust` — la recompensa proyectada tras un ajuste: los APE se multiplican por el factor de
  reducción esperado `rho` (de configuración, o estimado del historial cuando hay dos iteraciones
  o más), y se paga una iteración más de penalización `γ`.
- `R_reject` — una constante de configuración: lo que vale entregar nada.

`adjust` deja de estar disponible al alcanzar `max_iterations`. El respaldo determinista se
conserva: si todos los bloques están dentro de tolerancia, se acepta sin consultar la política.

Esto no es cosmético. Cambia el comportamiento en un caso real: cuando el error es pequeño pero
está fuera de tolerancia y ya se llevan varias iteraciones, `γ·n` puede hacer que aceptar valga más
que seguir ajustando. Las reglas actuales nunca toman esa decisión, y es material directo para el
capítulo de resultados.

**Trazabilidad.** Cada registro del historial gana `reward`, `converged` y `action_rewards` (la
recompensa estimada de cada acción). `best_iteration` pasa a elegirse por recompensa máxima en
lugar de por error relativo mínimo.

**Temperatura fija.** `build_chat_model` pasa `temperature` desde configuración. Sin esto la
evaluación no es repetible y el criterio de aceptación no se cumple.

### Fase 2 — El amplificador no inversor

Resuelve el hallazgo C1. Cuarto tipo de bloque, `noninverting_amp`, con parámetros `v_in` y
`v_out`, y meta sobre `v_out` medido en el punto de operación.

La ganancia es `Av = 1 + Rf/Rg`; con `Rg` fijo de configuración, `Rf = Rg·(Av − 1)`. El operacional
entra como **macromodelo de un polo** —resistencia de entrada, fuente controlada de ganancia en
lazo abierto, red RC del polo dominante y etapa de salida— declarado como `.subckt` en el netlist.
Es un macromodelo de comportamiento en terminales, exactamente lo que los límites de la tesina
describen, sin modelar transistores.

La regla de ajuste de respaldo es proporcional sobre `Rf`.

### Fase 3 — El cálculo híbrido

Resuelve el hallazgo B1. El worker de cálculo gana un paso previo: pedir al LLM los valores con las
ecuaciones de diseño del bloque en contexto, con salida estructurada validada por Pydantic.

La verificación compara cada valor propuesto contra el de la fórmula cerrada. Si la desviación
relativa supera el umbral de configuración, **gana la fórmula**. El resultado del worker incluye
`llm_proposal`, `formula_values` y `agreement` por bloque, que viajan al historial.

Degrada como el orquestador: sin LLM configurado, el worker usa la fórmula y marca la propuesta
como ausente. El pipeline nunca depende del modelo para producir un circuito.

*Nota de implementación:* el `user_id` viaja en `config.configurable`, y LangGraph solo lo inyecta
si el segundo parámetro del nodo está anotado como `RunnableConfig`. Los workers se despachan con
la API `Send`, así que hay que verificar que el config se propaga al subgrafo.

### Fase 4 — La infraestructura

Resuelve D1, D2, D3 y G1.

**Contenedores.** Un `Dockerfile` por aplicación y un `docker-compose.yml` que las levanta juntas.
El de agents instala el binario `ngspice`, que es la dependencia de sistema que hoy se asume
presente. Esto convierte en cierta la afirmación de que la ejecución de artefactos generados se
contiene por contenedor.

**Checkpointer sobre Postgres.** Se sustituye `MemorySaver` por el checkpointer de LangGraph sobre
Postgres, y se corrigen dos defectos que hoy anulan la recuperabilidad por completo: el grafo se
construye **una vez** al arrancar la aplicación, no por petición, y el `thread_id` pasa a ser el
`executionId` que envía el server, no un UUID nuevo por corrida. Con eso una ejecución interrumpida
sí puede retomarse, que es lo que el RNF-03.2 promete.

**API keys de usuario.** Se habilita el plugin `apiKey` de better-auth, con emisión y revocación
desde la pantalla de configuración. Cierra el caso de uso y el control de seguridad que la tesina
describe en dos capítulos.

### Fase 5 — La evaluación experimental

Resuelve F1 y habilita F2. Es el objetivo específico 6 completo.

**El banco de pruebas**: un archivo de casos con solución de referencia calculada a mano, cubriendo
los cuatro tipos de circuito con varias metas cada uno.

**La línea base best-of-N**: pide al LLM `N` netlists completos para la misma descripción, sin
realimentación, los simula y conserva el mejor. `N` se fija igual al número de llamadas al modelo
que consume el sistema, para que la comparación sea a igual presupuesto.

**Las métricas**: MAPE por circuito y agregado, tasa de circuitos que cumplen la meta, número medio
de iteraciones, y el acuerdo LLM-fórmula de la Fase 3.

**La salida**: tablas en formato listo para pegar en el capítulo de pruebas.

### Fase 6 — La tesina

Con el sistema construido, se corrigen las secciones desfasadas y se escribe lo que falta:

- Reescribir "circuitos de varias etapas" como sub-bloques independientes (B3, B2).
- Precisar que el LLM propone y la fórmula verifica, con el dato de acuerdo como evidencia (B1).
- Corregir `npm` por el workspace de Bun (E3).
- Recortar la figura del espacio de trabajo y su pie, quitando consumo, `.csv` y `.svg` (E1, E2).
- Precisar los análisis que el sistema usa (C3).
- Enumerar los criterios de aceptación CA-01 a CA-07 como apéndice (F3).
- Escribir el capítulo de pruebas con los resultados de la Fase 5 (F2).
- Escribir gestión y conclusiones.

---

## Criterio de terminado

1. `uv run pytest` verde en agents, con `ngspice` real.
2. `bun test` verde en server, incluyendo los gateados por `RUN_DB_TESTS`.
3. `bun run test`, `bun run lint` y `bun run build` limpios en client.
4. El curador registra `reward` en cada iteración del historial, y existe al menos un caso de
   prueba donde la política acepta un circuito que las reglas anteriores habrían seguido ajustando.
5. Un amplificador no inversor pedido en lenguaje natural produce un netlist con macromodelo que
   ngspice simula y cuya ganancia medida cae dentro de tolerancia.
6. `docker compose up` levanta las tres aplicaciones y el flujo completo funciona dentro de los
   contenedores.
7. Una ejecución interrumpida se retoma desde su último checkpoint al reenviarla con el mismo
   `executionId`.
8. El usuario emite una API key desde la interfaz, la usa para autenticar una solicitud, y la
   revoca.
9. El reporte de evaluación produce MAPE, tasa de resolución y la comparación best-of-N sobre el
   banco completo.

## Orden de ejecución y planes

| Plan | Fase | Depende de |
|---|---|---|
| `2026-08-19-curador-formalizado.md` | 1 | — |
| `2026-08-19-amplificador-operacional.md` | 2 | Fase 1 (métricas y config) |
| `2026-08-19-calculo-hibrido.md` | 3 | Fase 1 (config, temperatura) |
| `2026-08-19-infraestructura.md` | 4 | independiente |
| `2026-08-19-evaluacion-experimental.md` | 5 | Fases 1, 2, 3 |
| `2026-08-19-correcciones-tesina.md` | 6 | Fase 5 |

La Fase 4 es independiente y puede intercalarse en cualquier momento; conviene hacerla temprano
porque el contenedor con `ngspice` simplifica correr la evaluación de la Fase 5 de forma
reproducible.
