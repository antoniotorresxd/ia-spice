# Subagentes de dominio (backend / frontend / langgraph) sobre Codex CLI + graphify

## Contexto y motivación

Hasta ahora, Claude Code (este asistente) leía el repo directamente y escribía el código.
A partir de ahora cambia el rol: Claude pasa a ser **planeador y revisor general** —
descompone la tarea, decide qué dominio(s) del proyecto tocan, delega la implementación
real a **Codex CLI** (vía el plugin `codex`, modelo barato por default), y al final
revisa que lo que produjo cada dominio conecte con los demás. Claude ya no edita código
directamente en ningún dominio.

El repo tiene tres áreas de código con ciclos de vida y herramientas de verificación
distintas (ver `CLAUDE.md`): `project/apps/server` (backend, Bun/Hono), `project/apps/client`
(frontend, Vite/React) y `project/apps/agents` (LangGraph, Python/uv). Cada una necesita
su propio contexto, su propio comando de verificación y su propio criterio de cuándo el
trabajo está listo — por eso se modela como **tres subagentes de dominio**, no uno genérico.

El problema que resuelve **graphify** aquí: sin él, cada subagente (y Codex dentro de él)
tendría que re-explorar el árbol de archivos a ciegas en cada tarea, con alto riesgo de
perderse entre módulos o de repetir errores ya resueltos antes. graphify ya tiene el grafo
de código de este workspace indexado y memoria persistente entre sesiones — se usa como
la fuente de contexto principal, en vez de leer archivos a tientas.

## Objetivo

Definir tres subagentes de Claude Code (`backend`, `frontend`, `langgraph`), versionados
en el repo, que:

1. Se orientan con graphify antes de tocar nada.
2. Delegan la implementación real a Codex CLI (modelo barato por default, escalable a un
   modelo más potente cuando el subagente lo decida).
3. Verifican el resultado ellos mismos con las herramientas de cada dominio.
4. Reportan a Claude (el planeador) qué cambió y qué contrato exponen hacia otros dominios.

Fuera de alcance: cambiar el pipeline de LangGraph en sí, cambiar cómo funciona
`codex-companion.mjs`, o construir un cuarto agente de "arquitectura transversal"
(descartado explícitamente — Claude cumple ese rol).

## Arquitectura

```
Usuario
  │
  ▼
Claude (planeador/revisor)
  │  descompone la tarea, decide qué dominio(s) tocan
  ├──▶ subagente "backend"     ─┐
  ├──▶ subagente "frontend"     ├─ en paralelo si son independientes
  └──▶ subagente "langgraph"   ─┘
         │
         │  (dentro de cada subagente, ciclo propio)
         ▼
   graphify (contexto)  →  Codex CLI (implementa)  →  verificación local (Bash)
         │                                                    │
         └──────────────── remember (graphify) ◀──────────────┘
         │
         ▼
   reporte a Claude: qué cambió, qué se verificó, qué contrato queda expuesto
```

Claude, al recibir los reportes de los subagentes que tocó, revisa manualmente los puntos
de contacto entre dominios (p. ej. si backend cambió una ruta, ¿frontend regeneró tipos y
actualizó su llamada?) antes de dar el trabajo por terminado.

## El ciclo de cada subagente de dominio

Los tres subagentes comparten el mismo ciclo de 6 pasos; solo cambian las rutas de
graphify, el comando de verificación, y detalles de dominio (abajo).

1. **Orientarse con graphify primero, siempre.**
   `list_repositories` / `set_workspace` si hace falta, luego `graphify_find`,
   `graph_stats`, `graphify_file_neighbors`, `graphify_trace`, `graphify_impact` según lo
   que pida la tarea, para ubicar archivos y relaciones reales antes de plantear nada.
   Si graphify tiene memoria activa para el workspace, corre `memories_about` sobre los
   símbolos/archivos clave para no repetir decisiones o errores ya resueltos.

2. **Planear** en 3-6 líneas qué va a cambiar y en qué archivos, basado en lo que graphify
   mostró — no en suposiciones ni en explorar el árbol a mano.

3. **Delegar a Codex.** Un `Bash` call a:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task --write [prompt]
   ```
   Sin `--model` (usa el default de codex-companion; ver política de modelo abajo). El
   prompt incluye los hallazgos de graphify (rutas exactas, firmas, símbolos dependientes)
   para que Codex no tenga que re-explorar el repo por su cuenta. Si la tarea se divide en
   piezas independientes, son varias llamadas `task` separadas, no una sola mezclada.
   Si Codex necesita continuar sobre lo mismo (falló la verificación, hay que ajustar), se
   usa `--resume-last` con el error concreto en vez de que el subagente arregle el código
   él mismo.

4. **Verificar él mismo**, vía Bash, con el comando de verificación de su dominio (ver
   tabla abajo). Si falla, vuelve al paso 3 con el error concreto. El subagente nunca edita
   código directamente — no tiene `Edit`/`Write` en sus herramientas — solo Bash (para
   correr Codex y los comandos de verificación) y las tools de graphify.

5. **Guardar en graphify** (`remember`) cualquier decisión, gotcha o convención nueva que
   valga la pena que sobreviva a la sesión.

6. **Reportar a Claude**: qué cambió, qué se verificó (y su resultado), qué quedó
   pendiente, y qué contrato expone hacia otros dominios (rutas nuevas, tipos, eventos).

## Especificidad por dominio

| | backend | frontend | langgraph |
|---|---|---|---|
| Ruta | `project/apps/server` | `project/apps/client` | `project/apps/agents` |
| Foco graphify | `src/modules/*` | `src/features/*` | `src/agents/*` |
| Verificación | `bun test` **y** `bun run build:server-types` (regenerar tipos para el cliente — paso crítico, se marca explícito en el prompt a Codex) | `bun run typecheck` (`tsc -b`) + `bun run lint` + `bun run test` | `uv run pytest` |
| Recordatorio en el prompt a Codex | Seguir el patrón de módulo (`*.model.ts`/`*.services.ts`/`*.index.ts`); rutas solo entran a `AppType` si el router es una expresión encadenada | Cada feature usa una service interface inyectada desde `App.tsx` (mock + HTTP real); correr `build:server-types` si el backend cambió antes de asumir un error de tipos | No hay mocks de `ngspice` — las pruebas corren el binario real; `RunnableConfig` debe tiparse explícito o LangGraph no inyecta `config.configurable` |

## Política de modelo

Por default, ningún subagente pasa `--model` a `codex-companion.mjs task` — usa el modelo
barato configurado como default en el runtime de Codex (`gpt-5.6-luna` hoy). Si el
subagente se topa con una tarea que claramente necesita más capacidad (falla dos veces
seguidas la verificación tras ajustes de Codex, razonamiento complejo, cambio
arquitectónico dentro del dominio), puede escalar pasando `--model <otro-modelo>` en esa
llamada puntual — no es necesario tocar la definición del agente para eso. El effort se
deja sin fijar (default de Codex) salvo que la tarea lo amerite explícitamente.

## Archivos y ubicación

Tres definiciones de subagente en `project/.claude/agents/` (versionadas en git, share
automático con cualquiera que abra el repo con Claude Code):

- `backend.md`
- `frontend.md`
- `langgraph.md`

Cada uno con frontmatter:
```yaml
---
name: backend   # / frontend / langgraph
description: ...
model: sonnet    # el modelo del propio subagente Claude, no el de Codex
tools: Bash
skills:
  - codex-cli-runtime
  - gpt-5-4-prompting
---
```
Sin `Edit`/`Write`/`Agent` en tools — el subagente no edita archivos directamente ni lanza
sus propios subagentes; su única vía de escritura de código es Codex vía Bash, y su única
vía de contexto estructurado es graphify (tools MCP disponibles globalmente, no listadas
en el frontmatter porque son server-level, no per-agent).

## Testing / rollout

No hay tests automatizados para esto — son prompts de subagente, no código de la
aplicación. La validación es: correr una tarea real y pequeña en cada dominio (p. ej. un
fix acotado) y confirmar que el ciclo completo — graphify → Codex → verificación →
reporte — funciona antes de confiar en ellos para tareas grandes.

## Riesgos conocidos

- **Codex sin contexto suficiente**: si el subagente no extrae bien de graphify antes de
  delegar, Codex puede perderse igual que si no hubiera graphify. El paso 1 es obligatorio
  y no opcional precisamente por esto.
- **Deriva de tipos server→client**: si el subagente de backend olvida
  `build:server-types`, el frontend puede typecheckear contra una API vieja sin que nadie
  lo note hasta runtime. Por eso está explícito como paso de verificación, no solo como
  nota.
- **Escalamiento de modelo silencioso**: como el modelo se puede escalar sin tocar la
  definición del agente, dos corridas del mismo agente pueden usar modelos distintos sin
  que quede registrado en ningún lado más que el reporte de esa sesión. Aceptable por
  ahora — no se pide trazabilidad de costo en este diseño.
