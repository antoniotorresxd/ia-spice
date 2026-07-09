# Diseño: primer corte del ecosistema de agentes (Escritura → Shell)

Fecha: 2026-07-08

## Contexto

La tesina (`tesina/doc/main/sections/propuesta_solucion.tex`) define dos subsistemas
con despliegue independiente: el **cliente** (Hono/Bun, en `project/apps/server`,
maneja auth/sesiones/workspaces/API keys) y el **servidor de agentes** (ecosistema
LangGraph: Orquestador, Cálculo Master-Worker, Curador RL, Shell, Escritura). Este
documento cubre solo el primer corte de implementación de ese segundo subsistema.

LangGraph, PySpice y ngspice son herramientas de Python, incompatibles con el
runtime Bun/TS del subsistema cliente. Por eso el ecosistema de agentes vive en un
proyecto Python independiente, `project/apps/agents`, gestionado con `uv` (el
usuario lo crea con `uv init`; este diseño no incluye el scaffold del proyecto).

## Alcance de este corte

Construir un `StateGraph` de LangGraph mínimo con dos nodos reales — `escritura` y
`shell` — encadenados en secuencia (`escritura → shell → END`), sobre un
`MemorySaver` como checkpointer. La entrada es un estado hardcodeado: un circuito
de prueba fijo (divisor de voltaje resistivo: `v_in`, `r1`, `r2`).

Explícitamente fuera de alcance en este corte: el agente Orquestador (extracción
de lenguaje natural vía LLM), el agente de Cálculo (patrón Master-Worker), el
agente Curador (lazo de ajuste por RL), y persistencia del checkpointer en base
de datos (queda para cuando exista el lazo iterativo del Curador).

Objetivo: validar de extremo a extremo la tubería determinista — generar netlist,
simularlo en ngspice, leer métricas — antes de introducir LLM o RL.

## Estado compartido

```python
class CircuitState(TypedDict):
    # Entrada (hardcodeada en este corte)
    circuit_spec: dict  # {"v_in": 5.0, "r1": 1000, "r2": 2000}

    # Escrito por el nodo 'escritura'
    netlist_path: str | None
    netlist_text: str | None

    # Escrito por el nodo 'shell'
    raw_output_path: str | None
    metrics: dict | None       # ej. {"v_out": 3.33}
    sim_error: str | None      # si ngspice falló
```

## Agentes

### Escritura

Arma el circuito con PySpice a partir de `circuit_spec` y serializa el netlist a
un archivo `.cir`. Escribe `netlist_path` y `netlist_text` en el estado. No invoca
ngspice ni sabe nada de simulación — su responsabilidad termina al producir el
archivo.

### Shell

Ejecuta `ngspice` como proceso externo (`subprocess`) sobre el `.cir` producido
por Escritura, en lugar de usar la API embebida de PySpice
(`NgSpiceShared`/shared library). Razones:

- Coincide con el nombre y la descripción del agente en la propuesta de tesina
  ("agente de Shell — ejecución de ngspice").
- El modo shared-library de PySpice depende de un build específico de ngspice,
  más frágil de instalar/desplegar en contenedores que tener el binario
  `ngspice` en el `PATH`.
- Mantiene la frontera de bajo acoplamiento entre agentes: Escritura termina en
  un artefacto en disco; Shell empieza invocando un proceso externo sobre ese
  artefacto — ninguno conoce la implementación interna del otro.

Shell captura la salida (`.raw`/`wrdata`), parsea las métricas relevantes (para
el divisor de voltaje: `v_out`) y las escribe en `metrics`. Si ngspice falla
(código de salida ≠ 0, o el parseo no es posible), Shell escribe el motivo en
`sim_error` en vez de lanzar una excepción, de modo que el grafo termine
limpiamente — la lógica para decidir qué hacer ante un fallo de simulación le
corresponde al futuro agente Curador, no a Shell.

## Layout de módulos

```
project/apps/agents/
  src/agents/
    graph.py              # construye el StateGraph, compila con MemorySaver
    state.py               # CircuitState (TypedDict)
    escritura/
      __init__.py
      node.py              # función de nodo LangGraph: state -> state
      netlist.py           # arma el circuito PySpice y serializa a .cir
    shell/
      __init__.py
      node.py              # función de nodo LangGraph: state -> state
      ngspice_runner.py    # subprocess a ngspice + parseo de salida
  tests/
    test_escritura.py
    test_shell.py
    test_graph.py          # end-to-end del grafo completo
```

## Pruebas y manejo de errores

- `test_escritura.py`: dado un `circuit_spec` fijo, verifica que el netlist
  generado contenga los valores esperados. No invoca ngspice.
- `test_shell.py`: corre ngspice de verdad (no mock) sobre un netlist de prueba
  fijo, y verifica que las métricas parseadas coincidan con el resultado
  analítico del divisor de voltaje (ley de Ohm: `v_out = v_in * r2/(r1+r2)`).
- `test_graph.py`: corre el grafo completo (`escritura → shell`) de extremo a
  extremo con el `circuit_spec` de prueba y verifica el estado final.
- Manejo de errores: fallos de simulación se reflejan en `sim_error` en el
  estado, no como excepciones no capturadas — el grafo debe poder completar su
  ejecución (llegar a `END`) incluso si ngspice falla.

## Siguientes cortes (fuera de alcance aquí, para referencia futura)

1. Agente Curador (RL) leyendo `metrics`/`sim_error` y decidiendo aceptar/ajustar/rechazar,
   cerrando el lazo de iteración (`shell → curador → escritura` en caso de ajuste).
2. Persistencia del checkpointer en base de datos (Postgres/SQLite) una vez que
   exista el lazo iterativo.
3. Agente de Cálculo (Master-Worker) para circuitos multi-etapa.
4. Agente Orquestador con extracción de parámetros vía LLM a partir de lenguaje
   natural, sustituyendo el `circuit_spec` hardcodeado.
