# Auditoría: qué se descuadra entre el código y la tesina

Fecha: 2026-08-19
Método: revisión de cada afirmación verificable de la tesina contra el código del repositorio.
Alcance auditado: `tesina/doc/main/sections/` (objetivos, límites y alcances, marco teórico,
propuesta de solución, desarrollo) contra `project/apps/{agents,server,client}`.

Este documento **no propone la solución**, solo levanta el inventario. Cada hallazgo indica si
conviene corregir el **código** (porque la afirmación es parte de la aportación y debe cumplirse)
o el **documento** (porque la decisión del código es defendible y lo que sobra es la promesa).

---

## Estado de los hallazgos

Este documento es el diagnóstico de partida y **se conserva tal cual se levantó**: describe lo que
había, no lo que hay. Para saber qué sigue abierto, esta es la única tabla que hay que mirar.

| Hallazgo | Estado |
|---|---|
| A1 — no existe la función de recompensa | ✅ Cerrado (`curador/reward.py`) |
| A2 — no hay política, solo reglas fijas | ✅ Cerrado como MDP formalizado con decisión por recompensa; la política *aprendida* queda como trabajo futuro, por decisión de alcance registrada en el diseño |
| A3 — parámetros no están en configuración externa | ✅ Cerrado (`config/curador.yaml`, incluidos `max_iterations` y `tolerance`, que ahora gobiernan los valores por omisión del schema) |
| A4 — el estado observado es más pobre que el descrito | ⚠️ Parcial: se registra la convergencia (`converged`), que era lo que la fórmula necesitaba. Siguen sin capturarse voltajes de nodo y corrientes de rama |
| A5 — el historial no guarda la recompensa | ✅ Cerrado (`reward`, `weighted_ape`, `converged` y `action_rewards` por iteración) |
| D4 — la temperatura del LLM no se fija | ✅ Cerrado (`llm.temperature` en la configuración) |
| B1, B2, B3, C1, C2, C3, D1, D2, D3, E1–E4, F1–F3, G1, G2 | Abiertos — planificados en las fases 2 a 6 del diseño de la iteración |

Referencia: [`docs/superpowers/specs/2026-08-19-cierre-de-la-tesina-design.md`](superpowers/specs/2026-08-19-cierre-de-la-tesina-design.md).

---

## Resumen

| Área | Hallazgos | Críticos |
|---|---|---|
| A. Curador y aprendizaje por refuerzo | 5 | 3 |
| B. Agente de cálculo y Master-Worker | 3 | 2 |
| C. Alcance de circuitos y simulación | 3 | 1 |
| D. Arquitectura, persistencia y despliegue | 4 | 2 |
| E. Cliente y capturas del prototipo | 4 | 1 |
| F. Evaluación experimental | 3 | 2 |
| G. Seguridad | 2 | 1 |

**Lo que sí está correcto y no requiere acción** se lista al final (sección H), para que la
revisión no lea como si nada funcionara: el pipeline completo corre de punta a punta y la mayor
parte del capítulo de seguridad es verificable en el código.

Criterio de severidad:

- 🔴 **Crítico** — toca un objetivo específico o la aportación central. La tesina no se sostiene sin esto.
- 🟠 **Importante** — afirmación falsa y verificable por el sinodal abriendo el repositorio.
- 🟡 **Menor** — se corrige con una frase en el documento.

---

## A. El curador y el aprendizaje por refuerzo

Es el área más grave: el objetivo específico 4 es *"Desarrollar el agente curador, basado en
aprendizaje por refuerzo"*, y hoy no existe ningún elemento de aprendizaje por refuerzo en el
código.

### A1. 🔴 La función de recompensa no existe

**La tesina dice** (`marco_teorico.tex:36`) que la recompensa se calcula con

```
R = -Σᵢ (wᵢ · APEᵢ) + βc - γn
```

donde `APEᵢ` es el error porcentual absoluto del parámetro *i*, `wᵢ` su peso, `c` vale 1 si la
simulación convergió, `n` es el número de iteración, y `β`/`γ` son constantes configurables.

**El código** nunca calcula una recompensa. `curador/node.py` evalúa cada bloque con
`evaluate_block` (`curador/policy.py:4`), que devuelve solo `("ok"|"off"|"error", error_relativo)`,
y decide por comparación directa contra la tolerancia. No hay pesos, ni `β`, ni `γ`, ni `R` en
ninguna parte del repositorio.

**Acción: código.** Es la ecuación central del marco teórico; si no se implementa, el capítulo
de RL describe un sistema que no se construyó.

### A2. 🔴 No hay política de RL, solo reglas fijas

**La tesina dice** (`propuesta_solucion.tex:146`) que *"el curador dispone de una decisión
determinista por reglas **como respaldo de su política**"* — la redacción presupone que existe una
política aprendida y que las reglas son el plan B.

**El código** solo tiene el plan B. `ADJUST_RULES` (`curador/policy.py:32`) son tres funciones de
ajuste proporcional cableadas por tipo de circuito, y `curador_node` decide con dos `if`: si no
hay bloques fallando acepta, si se agotaron las iteraciones rechaza, si no ajusta. No hay estado
de aprendizaje, ni exploración, ni actualización de política entre corridas.

**Acción: código.** Con la salvedad de que el propio marco teórico ofrece una salida honesta
(`marco_teorico.tex:31`): *"El interés de este marco para el proyecto no es entrenar una política
sobre un entorno arbitrario, sino formalizar la decisión que toma el curador"*. Formalizar el MDP
(estados, acciones, recompensa) y elegir la acción que maximiza `R` es defendible; **no** calcular
`R` en absoluto, no lo es. Esta es la decisión de alcance más importante del proyecto.

### A3. 🟠 Los parámetros no están en configuración externa

**La tesina dice**, en dos lugares (`marco_teorico.tex:39` y `propuesta_solucion.tex:36`, que lo
registra como RNF-04.2), que *"los pesos, los factores y el número máximo de iteraciones se
mantienen en configuración externa, lo que permite ajustarlos durante la evaluación sin modificar
el código"*.

**El código** los tiene incrustados:

- `curador/policy.py:1` — `R_MIN = 1.0`
- `curador/policy.py:41` — factor de perturbación `1.05`
- `calculo/formulas.py:3-5` — `R1_DEFAULT`, `R_RC_DEFAULT`, `R_MIN`
- `orquestador/schema.py:50-51` — `max_iterations` y `tolerance` como valores por omisión del
  esquema Pydantic, no como archivo de configuración

No existe ningún `.yaml`, `.toml` de configuración ni módulo `config` en `apps/agents`.

**Acción: código.** Es además prerequisito de A1 y de toda la evaluación: sin poder mover los
pesos no se puede experimentar.

### A4. 🟠 El estado que observa el curador es más pobre que el descrito

**La tesina dice** (`marco_teorico.tex:33`) que el estado observado son *"el error relativo de cada
parámetro, si la simulación convergió, los voltajes de nodo y las corrientes de rama"*.

**El código** captura **un solo escalar por bloque**. `shell/node.py:23-24` lee una métrica única
con `parse_wrdata_scalar` y arma `{"metrics": {metric: value}}`. No hay voltajes de nodo, no hay
corrientes de rama, y la convergencia no se registra como variable: solo se infiere de que
`sim_error` sea `None`.

Esto bloquea A1 de forma directa: la variable `c` de la fórmula de recompensa no tiene de dónde
salir, y `Σᵢ` sobre "cada parámetro" es una suma de un solo término.

**Acción: código.**

### A5. 🟠 El historial no guarda la recompensa

**La tesina dice** (`propuesta_solucion.tex:152`) que *"el sistema conserva el historial de
iteraciones **y la recompensa que el curador calcula en cada ciclo**"*, y apoya en ello tanto el
atributo de trazabilidad como el control de seguridad de la sección de riesgos.

**El código** arma el registro en `curador/node.py:19-25` con `iteration`, `component_values`,
`sim_results`, `evaluations`, `worst_rel_err` y `decision`. No hay campo de recompensa.

**Acción: código** (se resuelve solo con A1).

---

## B. El agente de cálculo y el patrón Master-Worker

### B1. 🔴 El LLM no participa en el cálculo de componentes

**La tesina dice**, dos veces en el marco teórico, que el LLM se usa en **dos** puntos:

- `marco_teorico.tex:13` — *"lo que el sistema necesita en dos puntos: la extracción de los
  parámetros eléctricos [...] y **el cálculo de los valores de los componentes de cada
  sub-bloque**"*
- `marco_teorico.tex:15` — *"permite proporcionarle las ecuaciones de diseño de un sub-bloque como
  contexto y obtener los valores correspondientes"*

**El código** usa el LLM **solo** en el orquestador. `calculo/graph.py:26-29` ejecuta
`FORMULAS[block["type"]](block["params"])`, es decir funciones Python cerradas
(`calculo/formulas.py`). El agente de cálculo es puramente determinista.

**Acción: documento o código.** Esta es una decisión legítima de ingeniería —una fórmula cerrada
es más confiable y más barata que un LLM para un divisor de voltaje— pero el marco teórico afirma
lo contrario. O se conecta el LLM al cálculo, o se reescribe el marco teórico para explicar que el
LLM interpreta y las ecuaciones de diseño se aplican de forma determinista. **La segunda opción es
más defendible técnicamente y mucho más barata.**

### B2. 🟠 La fase Reduce no existe

**La tesina dice** (`marco_teorico.tex:25`) que el patrón es Master-Worker con Map-Reduce, donde
*"un nodo final recombina los resultados parciales en una solución completa (fase Reduce)"*, y que
la recombinación se hace *"verificando que los nodos de conexión entre sub-bloques vecinos
coincidan"*.

**El código** (`calculo/graph.py:32-39`) construye `START → master → workers → END`. No hay nodo
Reduce. La "recombinación" ocurre de forma implícita en el reducer `merge_dicts` del estado
(`state.py:6`), que solo hace merge de diccionarios por `block_id` — no verifica nada.

**Acción: código o documento.** Ligado a B3: sin conexiones entre bloques, no hay nada que
verificar, así que este hallazgo y el siguiente se resuelven juntos.

### B3. 🔴 No hay circuitos de varias etapas: los bloques son independientes

Es el hallazgo estructural más profundo, y sostiene varias afirmaciones de la tesina a la vez.

**La tesina dice**, de forma repetida y en los objetivos, que el sistema *"divide circuitos de
varias etapas en sub-bloques"* (`limites_alcances.tex:4`, `objetivos.tex:10`,
`propuesta_solucion.tex:21`) y que los sub-bloques vecinos comparten nodos de conexión.

**El código** no tiene noción de topología. `CircuitSpec` (`orquestador/schema.py:45-58`) es una
lista plana de bloques sin ningún campo de conexión, y `escritura/netlist.py` construye un
`Circuit` de PySpice **independiente y completo por bloque**, cada uno con su propia fuente y su
propia tierra. Es decir: lo que hoy llamamos "un circuito de tres sub-bloques" son en realidad
tres circuitos separados que se simulan por su cuenta y nunca se conectan entre sí.

Esto también vacía de contenido la justificación de la concurrencia: los bloques se calculan en
paralelo porque son independientes, sí, pero lo son porque son circuitos distintos, no porque el
sistema haya analizado las dependencias de un circuito multietapa.

**Acción: decisión de alcance.** Implementar topología real es trabajo considerable (esquema de
conexiones, netlist compuesto, verificación de nodos en el Reduce, métricas de interfaz). La
alternativa es reescribir la tesina para hablar de "un conjunto de sub-bloques independientes" en
lugar de "un circuito de varias etapas", lo cual debilita bastante la propuesta.

---

## C. Alcance de circuitos y simulación

### C1. 🔴 Solo tres topologías, todas triviales

**La tesina dice** (`limites_alcances.tex:6`) que el sistema trabaja con *"resistores,
capacitores, inductores, fuentes, diodos, transistores y amplificadores operacionales descritos
por su macromodelo"*, y el marco teórico usa como ejemplo un amplificador no inversor con
operacional (`marco_teorico.tex:7`).

**El código** soporta exactamente tres tipos (`orquestador/schema.py:39-42`):
`voltage_divider`, `rc_lowpass` y `led_resistor`. Es decir: resistores, un capacitor y un diodo.
**No hay inductores, ni transistores, ni amplificadores operacionales, ni macromodelos.**

**Acción: código o documento.** Añadir un amplificador no inversor con macromodelo de operacional
sería el mayor salto de credibilidad por unidad de esfuerzo: cubre el ejemplo que el propio marco
teórico usa, introduce el macromodelo que los límites prometen, y da un circuito no trivial para
la evaluación.

### C2. 🟡 Una sola métrica escalar por simulación

`shell/ngspice_runner.parse_wrdata_scalar` devuelve un escalar. La tesina habla de leer "las
métricas" en plural en todo el documento. Se resuelve junto con A4.

### C3. 🟡 No hay análisis transitorio

**La tesina dice** (`marco_teorico.tex:47`) que el simulador ofrece análisis de CD, de CA y
transitorio, *"pertinentes para circuitos CA/CD"*.

**El código** usa `op` (punto de operación) en el divisor y el LED, y `ac` en el filtro RC
(`escritura/netlist.py`). No hay ningún `tran`.

**Acción: documento**, salvo que se añada un circuito que lo requiera. La redacción actual describe
las capacidades de SPICE, no necesariamente las del sistema, así que basta precisar la frase.

---

## D. Arquitectura, persistencia y despliegue

### D1. 🔴 El *checkpointer* no persiste en base de datos y no aporta recuperabilidad

**La tesina dice**, en tres lugares, que el estado se persiste en base de datos y que eso da
tolerancia a fallos:

- `marco_teorico.tex:57` — *"un mecanismo de checkpointer que persiste el estado de la generación
  en una base de datos tras cada paso"*
- `propuesta_solucion.tex:36` — el estado se conserva *"mediante un mecanismo de checkpointer sobre
  una base de datos"*
- `propuesta_solucion.tex:146` — *"una ejecución interrumpida puede retomarse desde el último punto
  guardado en lugar de reiniciarse"*, registrado como RNF-03.2

**El código** usa `MemorySaver` (`graph.py:54`), que vive en la memoria del proceso. Y hay algo
peor: `api.py` llama a `build_graph()` **en cada petición** y genera un `thread_id` nuevo con
`uuid.uuid4()` en cada corrida. Con un checkpointer nuevo y un hilo nuevo por invocación, **ninguna
ejecución puede retomarse jamás**. La recuperabilidad que la tesina reclama es cero, no parcial.

**Acción: código.** Es una afirmación falsa sobre un requisito no funcional numerado.

### D2. 🔴 No hay despliegue en contenedores, y una afirmación de seguridad depende de ello

**La tesina dice** (`propuesta_solucion.tex:196` y `desarrollo.tex:105`) que la ejecución de
artefactos generados por el LLM se contiene *"dentro del entorno contenedorizado del servidor, cuyo
despliegue reproducible recoge el SRS (RIMP-10)"*, y que el aislamiento de ngspice *"descansa en la
contención por contenedor del despliegue"*.

**El repositorio no tiene Dockerfile, ni docker-compose, ni ningún archivo de CI/CD.** La búsqueda
no devuelve nada. Es decir: el único control de seguridad que protege la ejecución de código
generado por un modelo **no existe**, y el capítulo de desarrollo afirma que sí, en la sección
titulada "Análisis de seguridad de la implementación".

**Acción: código.** De todos los hallazgos, este es el que peor se ve en una revisión: es una
afirmación de seguridad verificable en treinta segundos.

### D3. 🟠 El subsistema de agentes no es "sin estado" en el sentido que la tesina defiende

**La tesina dice** (`objetivos.tex:9`) que el objetivo específico 1 incluye *"un servidor sin
estado que aloja a los agentes, condición que habilita su escalado horizontal"*, y
`marco_teorico.tex:55` lo sostiene sobre el argumento del balanceador de cargas.

**El código** sí es efectivamente sin estado entre peticiones (todo el estado vive en el Postgres
del server), pero: (a) el *checkpointer* en memoria contradice el argumento formal, (b) no hay
balanceador ni réplicas, y (c) agents llama de vuelta al server para resolver su configuración de
LLM (modelo *pull*, `llm/settings_client.py`), lo que lo hace dependiente de una llamada de red
adicional por corrida en lugar de recibir todo en la invocación.

**Acción: código o documento**, según cuánto se quiera defender el escalado horizontal.

### D4. 🟡 La temperatura del LLM no se fija

**La tesina dice** (`propuesta_solucion.tex:207`, como criterio de aceptación, y
`marco_teorico.tex:19`) que *"la salida sea repetible con la temperatura del LLM fijada, para
permitir la comparación de resultados durante la evaluación"*.

**El código** (`llm/factory.py:21-31`) construye el modelo con `model`, `model_provider`, `api_key`
y opcionalmente `base_url`. Nunca pasa `temperature`.

**Acción: código.** Es un cambio de una línea y es prerequisito de la evaluación (F1).

---

## E. Cliente y capturas del prototipo

### E1. 🔴 La figura 5.2 muestra datos ficticios descritos como reales

**La tesina dice** (`desarrollo.tex:42`, describiendo la captura del espacio de trabajo) que la
pantalla ofrece *"un resumen operativo del consumo del periodo —tokens utilizados, costo estimado,
tasa de solicitudes exitosas y tiempo procesado—, la actividad reciente [...] y los archivos
producidos por las generaciones"*.

**El código** inyecta `mockHomeService` en esa pantalla (`App.tsx:65`). Todos esos números salen de
`features/home/model/home-fixtures.ts`, que son constantes escritas a mano. El sistema **no mide**
tokens, ni costo, ni tiempo procesado, ni tasa de éxito en ninguna parte.

El capítulo de desarrollo presenta esa captura como evidencia de que *"el subsistema cliente
materializa los casos de uso"*. Presentar datos de fixture como operación real en el capítulo de
resultados es el hallazgo con mayor riesgo académico de toda la auditoría.

**Acción: código o documento.** O se conecta la pantalla de inicio a datos reales (implica medir e
instrumentar consumo, que hoy no existe en ningún lado), o se recorta la captura y se reescribe el
pie de figura para describir únicamente lo que sí es real: el campo de solicitud en lenguaje
natural y la navegación.

### E2. 🟠 Los archivos `.csv` y `.svg` no existen

**La tesina dice** (`desarrollo.tex:42`) que se producen *"netlists `.cir`, resultados `.csv` y
esquemáticos `.svg`"*.

**El código** genera **solo `.cir`**: `workspace.runner.ts` nombra cada artefacto como
`${blockId}.cir` con lenguaje `spice`. Los `.csv` y `.svg` de la captura vienen de
`home-fixtures.ts:12`, `:15` y `:141`. **El sistema no genera esquemáticos gráficos** — de hecho la
propia tesina los declara fuera de alcance en `limites_alcances.tex:6`, así que la captura
contradice a los límites del propio documento.

**Acción: documento.**

### E3. 🟡 El gestor de dependencias del cliente no es npm

**La tesina dice** (`desarrollo.tex:24`) que *"cada aplicación gestiona sus propias dependencias con
su gestor correspondiente (`npm`, `bun` y `uv`, respectivamente)"*.

**La realidad**: `client` y `server` comparten **un único workspace de Bun** (`project/package.json`
con `workspaces: ["apps/*"]`), un solo `bun.lock` y un solo `node_modules`. Se instalan juntos con
un `bun install` desde `project/`. `npm` no se usa en ninguna parte.

**Acción: documento.**

### E4. 🟡 Las pantallas de Archivos y Ejecuciones siguen vacías

`App.tsx:26` renderiza un marcador "Próximamente". La tesina no las promete explícitamente, pero
la captura de la figura 5.2 sí muestra archivos, lo que las sugiere. Se resuelve junto con E2.

---

## F. Evaluación experimental

### F1. 🔴 No existe nada de la evaluación

**La tesina dice** (`objetivos.tex:14`, objetivo específico 6) *"**Evaluar** el desempeño del
sistema sobre un conjunto de circuitos de prueba con solución de referencia, mediante el error
porcentual absoluto medio (MAPE) y la tasa de circuitos que cumplen las metas, y contrastarlo con
el de un enfoque de un solo modelo que repite el intento varias veces (best-of-N)"*.

**No existe**: ni el banco de circuitos de prueba con solución de referencia, ni el cálculo de
MAPE, ni la tasa de resolución, ni la línea base best-of-N, ni ningún script de experimentación.

**Acción: código.** Es un objetivo específico completo, sin empezar. Depende de A1 (recompensa),
A3 (config externa) y D4 (temperatura fija).

### F2. 🔴 El capítulo de pruebas está vacío

`tesina/doc/main/sections/pruebas.tex` tiene **0 bytes**. También `gestion.tex` y
`conclusiones.tex`. El capítulo de desarrollo remite a él (*"cuyos resultados se documentan en el
capítulo de pruebas"*, `desarrollo.tex:24`) y toda la tabla de calidad
(`propuesta_solucion.tex:158-181`) apunta a mediciones que ese capítulo debería contener.

**Acción: documento**, pero solo puede escribirse después de F1.

### F3. 🟠 Los criterios de aceptación CA-01 a CA-07 se citan pero no se enumeran

La tabla de calidad referencia `CA-03`, `CA-04`, `CA-05`, `CA-06` y la historia SCRUM-58 habla de
validar contra "CA-01 a CA-07", pero el cuerpo de la tesina nunca los lista. Viven presumiblemente
en el SRS, que no está en el repositorio.

**Acción: documento.** Conviene incluirlos como apéndice, porque son la vara con la que el propio
documento dice que se medirá.

---

## G. Seguridad

### G1. 🔴 Las API keys de usuario no existen

**La tesina dice**, en la propuesta funcional (`propuesta_solucion.tex:47`, como caso de uso) y en
seguridad (`propuesta_solucion.tex:192`), que *"la autorización de las solicitudes al servidor se
realiza mediante API keys que el usuario emite y puede revocar, de modo que cada solicitud que
llega al servidor viaja autenticada"*, y lo presenta como el control que atiende el riesgo de
control de acceso roto.

**El código** solo tiene sesiones de navegador por cookie. Los plugins de better-auth habilitados
son `openAPI()` y `dash()` (`auth.services.ts:39-41`); **el plugin `apiKey` no está**. No hay
emisión ni revocación de claves de usuario en ninguna ruta.

Ojo con la confusión de nombres: el módulo `llm` sí guarda API keys, pero son las **claves de los
proveedores de LLM** que el usuario registra (su clave de OpenAI, por ejemplo), no claves emitidas
por el sistema para autenticar al usuario. Son cosas distintas y la tesina describe la segunda.

**Acción: código o documento.** Habilitar el plugin `apiKey` de better-auth es trabajo acotado; la
alternativa es reescribir el caso de uso y el control de seguridad para hablar de sesiones.

### G2. 🟡 La contención por contenedor se afirma sin que exista

Ya cubierto en D2; se anota aquí porque aparece dentro del capítulo de seguridad y es ahí donde un
revisor lo buscará.

---

## H. Lo que sí está correcto

Para que la auditoría sea justa, esto se verificó y **coincide** con lo que la tesina afirma:

- El pipeline completo corre de punta a punta: lenguaje natural → orquestador con LLM → cálculo →
  netlist con PySpice → **ngspice real** → curador → netlist persistido y recuperable en la web.
  No hay mocks de ngspice en ninguna prueba.
- La URL del repositorio (`desarrollo.tex:13`) coincide con el remoto real.
- La organización en monorepo con `client/`, `server/` y `agents/` corresponde con el nivel 2 del C4.
- Autenticación delegada en Better Auth bajo `/api/auth`, con cookies `Secure` en producción.
- Cifrado **AES-256-GCM** real de las claves de proveedor (`llm.crypto.ts:5`), con la clave en
  variable de entorno y nunca devuelta por ninguna ruta.
- Token de servicio entre agents y server comparado con `timingSafeEqual`, y caché en memoria de
  60 segundos del lado de agents.
- Validación estricta del entorno con Zod al arranque, que termina el proceso si falta algo.
- CORS con lista explícita de orígenes y credenciales.
- Guarda `requireAuth` aplicada por ruta en el módulo `workspace`, no globalmente.
- Salida del LLM forzada a esquema Pydantic, y netlist construido de forma determinista con
  PySpice en lugar de generado como texto libre por el modelo.
- Los archivos `.env` están fuera del control de versiones en las tres aplicaciones.
- Convención de *conventional commits* en todo el historial.

El patrón general de la auditoría es claro: **lo construido está bien construido; el problema es
que la tesina promete un sistema más grande del que existe.** Las brechas no son errores de
implementación, son funcionalidad que nunca se empezó.

---

## Dependencias entre hallazgos

El orden no es libre. Estas son las precedencias reales:

```
A3 (config externa)  ──┐
A4 (métricas ricas)  ──┼──> A1 (recompensa R) ──> A5 (history) ──> A2 (política RL)
                       │                                              │
D4 (temperatura fija) ─┘                                              v
                                                              F1 (evaluación: MAPE,
C1 (más topologías) ──────────────────────────────────────>    best-of-N, banco)
                                                                      │
                                                                      v
                                                              F2 (capítulo de pruebas)
```

`D2` (contenedor) y `D1` (checkpointer en base de datos) son independientes del resto y pueden
hacerse en cualquier momento. `B3` (topología real) es la decisión que más trabajo desencadena y
conviene resolverla antes de tocar `C1`.
