# Diseño: segundo corte del ecosistema de agentes (pipeline completo determinista)

Fecha: 2026-07-13

## Contexto

El primer corte (`2026-07-08-agents-escritura-shell-slice-design.md`) dejó
funcionando la tubería mínima `escritura → shell → END` sobre un `StateGraph`
de LangGraph con `MemorySaver`, con un `circuit_spec` hardcodeado (divisor de
voltaje) y ngspice real ejecutado por subprocess. La tesina
(`tesina/doc/main/sections/propuesta_solucion.tex`) define el ecosistema
completo con cinco agentes: Orquestador, Cálculo (Master-Worker), Curador (RL),
Escritura y Shell, coordinados sobre un grafo con estado y un lazo iterativo de
simulación-ajuste acotado por un máximo de iteraciones.

## Alcance de este corte

Cerrar la **topología completa** del pipeline con los cinco agentes conectados
y el lazo iterativo funcionando, usando lógica **determinista en todos los
nodos** — cero LLM y cero RL. El objetivo es que la estructura del grafo, el
estado compartido y el control del lazo queden reales y probados, de modo que
las siguientes iteraciones solo sustituyan el *interior* de los nodos (LLM en
Orquestador, RL en Curador) sin tocar la estructura.

Explícitamente fuera de alcance en este corte:

- Extracción de lenguaje natural vía LLM (el spec de entrada sigue siendo un
  dict/JSON estructurado que provee el caller).
- Política RL en el Curador (se implementa la política determinista por reglas,
  que la tesina exige de todos modos como política fallback).
- Persistencia del checkpointer en base de datos (se mantiene `MemorySaver`).
- Composición de sub-bloques en un solo circuito multi-etapa (cada sub-bloque
  se simula como netlist independiente).
- El subsistema cliente (Hono/Bun) y cualquier exposición HTTP del grafo.

## Topología del grafo

Grafo padre con cuatro unidades; dos de ellas son **subgrafos compilados**
(patrón de encapsulamiento por agente, alineado al diagrama C4 nivel 3 de la
tesina):

```
orquestador ─┬→ [cálculo] → [síntesis] → curador ─┬→ END (accepted | rejected)
             │                  ↑                 │
             │                  └──── ajustar ────┘
             └→ END (spec inválido → rejected)
```

- **`orquestador`** — nodo simple: valida y normaliza el spec de entrada. Tiene
  arista condicional: spec válido → cálculo; inválido → END con `verdict`
  rejected.
- **`cálculo`** — subgrafo Master-Worker: un nodo `master` hace fan-out con la
  Send API de LangGraph (un worker por sub-bloque, en paralelo real) y los
  resultados se juntan vía reducer en el estado.
- **`síntesis`** — subgrafo que encapsula el corte anterior: `escritura → shell`.
  El lazo de ajuste del curador **re-entra aquí** (regenerar netlists con los
  valores ajustados y re-simular), no en cálculo: el curador ajusta valores de
  componentes directamente, sin recalcular desde fórmulas.
- **`curador`** — nodo simple con arista condicional de salida: `accept` /
  `reject` → END, `adjust` → síntesis.

## Estado compartido

`CircuitState` se extiende conservando los campos existentes. Las métricas y
artefactos pasan a estar keyed por sub-bloque:

```python
class CircuitState(TypedDict):
    # Entrada cruda del caller
    circuit_spec: dict

    # Escrito por 'orquestador'
    normalized_spec: dict | None   # sub-bloques tipados, metas con tolerancias,
                                   # max_iterations (default 5)

    # Escrito por los workers de 'cálculo' (reducer: merge por sub-bloque);
    # el curador lo muta al ajustar
    component_values: dict         # {block_id: {"r1": 1000, "r2": 2000, ...}}

    # Escrito por 'síntesis' (escritura + shell), keyed por sub-bloque
    netlists: dict                 # {block_id: {"path": ..., "text": ...}}
    sim_results: dict              # {block_id: {"metrics": {...} | None,
                                   #             "sim_error": str | None}}

    # Escrito por 'curador'
    iteration: int                 # contador del lazo
    history: list                  # un registro por iteración:
                                   # {iteration, component_values, metrics,
                                   #  decision, reason}
    verdict: dict | None           # {"status": "accepted" | "rejected",
                                   #  "reason": str, "best_iteration": int}
```

La validación del spec de entrada se hace con **Pydantic** dentro del
orquestador (modelos tipados por tipo de circuito). Ese schema Pydantic es la
interfaz que el futuro LLM del orquestador deberá producir. El estado del grafo
sigue siendo TypedDict, como hasta ahora.

## Agentes

### Orquestador (nuevo)

Valida `circuit_spec` contra el schema Pydantic, aplica defaults (tolerancias
±5%, `max_iterations = 5`), descompone la entrada en sub-bloques tipados con
sus metas, y escribe `normalized_spec`. Un spec inválido produce un `verdict`
`rejected` con el detalle del error de validación y el grafo termina — no se
lanza excepción (misma filosofía que `sim_error` en el primer corte).

### Cálculo (nuevo, subgrafo Master-Worker)

- `master`: lee los sub-bloques de `normalized_spec` y despacha con `Send` un
  worker por sub-bloque.
- `worker`: calcula determinísticamente los valores de componentes del bloque a
  partir de sus metas (fórmulas cerradas por tipo, ver catálogo abajo) y
  escribe su entrada en `component_values` (campo con reducer de merge).

### Síntesis (subgrafo: escritura → shell, adaptados)

- `escritura`: generaliza el generador actual — produce un netlist por
  sub-bloque según su tipo, a partir de `component_values` (ya no del
  `circuit_spec` crudo). Escribe `netlists`.
- `shell`: corre ngspice por cada netlist y escribe `sim_results` keyed por
  bloque. El análisis depende del tipo: `.op` para divisor y LED, `.ac` para el
  filtro RC (extraer frecuencia de corte). Fallos por bloque quedan en
  `sim_results[block_id]["sim_error"]`, nunca como excepción.

### Curador (nuevo, política determinista por reglas)

Por cada meta de cada bloque calcula el error relativo contra la tolerancia:

- **Todos los bloques dentro de tolerancia** → `accept`; `verdict.status =
  "accepted"`.
- **Algún bloque fuera de tolerancia y `iteration < max_iterations`** →
  `adjust`: regla proporcional sobre el componente dominante del bloque (ej.
  para el divisor, escalar `r2` por `v_target / v_actual`; para el RC, escalar
  `c` por `f_actual / f_target`; para el LED, escalar `r` por
  `i_actual / i_target`), incrementa `iteration`, registra en `history` y
  regresa a síntesis. Solo se re-sintetizan los bloques ajustados.
- **`sim_error` en algún bloque** → cuenta como iteración fallida: si quedan
  iteraciones, se reintenta con una perturbación simple de los valores del
  bloque; si no, `reject` con diagnóstico del error de ngspice.
- **Iteraciones agotadas sin cumplir metas** → `reject`, dejando en `verdict`
  la mejor iteración observada según `history`.

Cada pasada del curador agrega exactamente un registro a `history`, con la
decisión y su razón — insumo directo para el futuro reporte y para la señal de
recompensa del RL.

## Catálogo de tipos de circuito

Tres tipos deterministas; cada uno define fórmula de cálculo, plantilla de
netlist y métrica objetivo:

| Tipo | Parámetros de entrada | Meta | Análisis ngspice |
|---|---|---|---|
| `voltage_divider` | `v_in`, `v_out` objetivo | `v_out` | `.op` |
| `rc_lowpass` | frecuencia de corte `f_c` objetivo | `f_c` medida | `.ac` |
| `led_resistor` | `v_in`, `v_f` del LED, `i_led` objetivo | `i_led` | `.op` |

Un `circuit_spec` puede contener varios sub-bloques independientes (de tipos
mixtos); cada uno se calcula, sintetiza, simula y evalúa por separado. El
veredicto es global: se acepta solo si todos los bloques cumplen.

## Layout de módulos

```
project/apps/agents/
  src/agents/
    graph.py               # grafo padre: orquestador → cálculo → síntesis → curador
    state.py               # CircuitState extendido + reducers
    orquestador/
      __init__.py
      node.py              # validación/normalización
      schema.py            # modelos Pydantic por tipo de circuito
    calculo/
      __init__.py
      graph.py             # subgrafo master + workers (Send API)
      formulas.py          # fórmulas cerradas por tipo de circuito
    sintesis/
      __init__.py
      graph.py             # subgrafo escritura → shell
    escritura/             # (existente, generalizado por tipo)
      node.py
      netlist.py
    shell/                 # (existente, generalizado: .op y .ac)
      node.py
      ngspice_runner.py
    curador/
      __init__.py
      node.py              # política por reglas + arista condicional
      policy.py            # decisiones accept/adjust/reject y reglas de ajuste
  tests/
    test_orquestador.py
    test_calculo.py
    test_netlist.py        # (existente, extendido a los 3 tipos)
    test_ngspice_runner.py # (existente, extendido a .ac)
    test_curador.py
    test_graph.py          # e2e del pipeline completo
```

## Pruebas y manejo de errores

TDD con pytest y **ngspice real** (sin mocks), como en el primer corte.

- `test_orquestador.py`: spec válido → `normalized_spec` con defaults; spec
  inválido → `verdict` rejected con mensaje claro, sin excepción.
- `test_calculo.py`: fórmulas por tipo (unit) y subgrafo con fan-out de 2+
  bloques mezclados (integración) — verifica que el merge del reducer junte
  todos los bloques.
- `test_curador.py`: con métricas sintéticas — dentro de tolerancia → accept;
  fuera → adjust con la regla proporcional esperada; `sim_error` → reintento o
  reject según iteraciones restantes; agotamiento → reject con mejor iteración.
- `test_graph.py` (e2e, ngspice real):
  1. Divisor que converge a la primera iteración → accepted.
  2. Spec que requiere ≥1 ajuste y converge → accepted con `history` de 2+.
  3. Spec imposible de cumplir → rejected exactamente en `max_iterations`.
  4. Spec con 2 sub-bloques de tipos mixtos → ambos evaluados, veredicto global.
- Invariante global: el grafo siempre llega a `END` con un `verdict` poblado —
  ninguna entrada válida o inválida produce una excepción no capturada.

## Siguientes cortes (fuera de alcance aquí, para referencia futura)

1. Orquestador con LLM: extracción de lenguaje natural → schema Pydantic ya
   definido en este corte.
2. Curador con RL: política aprendida usando `history` como base de la señal
   de recompensa; la política por reglas queda como fallback.
3. Persistencia del checkpointer en base de datos (Postgres/SQLite).
4. Exposición del grafo vía HTTP y conexión con el subsistema cliente.
5. Circuitos multi-etapa (composición de sub-bloques en un solo netlist).
