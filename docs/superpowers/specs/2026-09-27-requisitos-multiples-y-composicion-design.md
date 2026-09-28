# Requisitos múltiples y composición de etapas — Diseño

Fecha: 2026-09-27
Estado: aprobado, listo para plan de implementación

## El problema

Hoy `CatalogParams`/`GenericParams` (`orquestador/schema.py`) llevan **una sola**
`metric` y **un solo** `target`, con **una** `tolerance` global para todo el
diseño (`CircuitSpec.tolerance`). `curador/reward.py` construye una medición
por bloque (`build_measurements`) y la recompensa suma sobre bloques, no sobre
requisitos dentro de un bloque. Y cada bloque se sintetiza y se simula por
separado: `escritura/node.py` arma un netlist y un `tempdir` por `block_id`,
sin importar que la petición diga que la salida de uno alimenta al otro.

Los prompts de diseño reales no piden eso. Piden combinaciones:

| Tipo de requisito | Ejemplos | ¿Hoy se verifica? |
|---|---|---|
| Objetivo ≈ valor | Zener 9 V, fc = 1 kHz, ganancia 2, VCE ≈ 6 V, IC ≈ 2 mA, LED a 10 mA | Solo uno por bloque |
| Límites (≤, ≥) | recortador entre −3.7 V y +5.7 V; ±0.7 V; corriente < 2 mA; carga hasta 50 mA | ❌ |
| Datos fijos del usuario | C = 100 nF, β = 100, VCC = 12 V, 60 Hz, 1 V de entrada | A medias: el solver los usa solo si el nombre coincide; si no, cae al valor por defecto del catálogo sin avisarlo |
| Restricciones de componentes | "resistencias comerciales", "R > 1 kΩ" | ❌ (fase 3, fuera de este diseño) |
| Objetivos de optimización | "consumo mínimo" | ❌ (fase 3, fuera de este diseño) |
| Comportamiento cualitativo | "solo semiciclos positivos", "correctamente polarizado" | ❌, pero traducible a medidas (`vmin ≈ 0`, `VCE > 0.2 V`) |
| Tolerancia explícita | "error menor al 5 %" | Solo una tolerancia global |
| Etapas encadenadas | filtro → amplificador, rectificador → filtro | ❌ — se simulan como circuitos independientes; nunca se comprueba el circuito completo |

El Zener es el caso que más lo expone: "9 V a una carga de máximo 50 mA" hay
que cumplirlo en el peor caso (carga máxima, tensión de entrada mínima), no en
un único punto de operación. Eso ya es un requisito de límite, no de igualdad.

## Por qué se fusionan fase 1 y fase 2

La separación original (requisitos múltiples primero, composición de etapas
después) suponía que un bloque seguía siendo la unidad de simulación. No lo
es: en cuanto un requisito necesita medirse en un nodo que solo existe después
de conectar dos bloques (la fc del filtro *y* la ganancia a la salida del
amplificador, sobre el mismo circuito), el modelo de requisitos por bloque
aislado ya no alcanza. Los ejemplos 13–16 del usuario y el prompt de
orquestación combinada dependen de eso desde el primer diseño de datos, no
como una extensión posterior. Diseñarlos por separado habría obligado a
retrabajar el esquema de requisitos en cuanto llegara la composición.

## La decisión

Cuatro principios, todos derivados de "los valores no definen el
comportamiento":

1. **La petición manda; el catálogo solo rellena huecos.** Un valor que da el
   usuario es fijo. Un valor del catálogo es un default que se usa solo si
   falta el dato, y se reporta como supuesto (hoy el solver cae en silencio al
   default si el nombre no coincide — eso deja de ser aceptable).
2. **Requisitos genéricos, no métricas por topología.** Cada requisito es
   `medida + comparador + valor + tolerancia`: `max(v(out)) ≤ 5.7 ±2%`,
   `fc(v(out)) ≈ 500 Hz ±5%`, `i(Vcc) < 2mA`. Un conjunto fijo y cerrado de
   tipos de medida (máximo, mínimo, pico a pico, valor DC, corriente, fc a
   −3 dB, ganancia a una frecuencia, rizado) se traduce siempre igual, de
   forma determinista, a un `.meas` de ngspice — sirve para cualquier
   circuito, curado o `generic`, sin escribir mediciones a mano por
   plantilla.
3. **El curador juzga todos los requisitos, sin reglas por topología.**
   `R = -Σᵢ wᵢ·APEᵢ` pasa a sumar sobre requisitos, no sobre bloques. El
   ajuste deja de ser "si hay RZ, toca RZ": se recalibra la consigna y se
   vuelve a resolver (pediste 5.7 V, salió 5.6 V → se resuelve para 5.8 V).
   Eso funciona con cualquier solver curado sin código por tipo. Para
   `generic`, el LLM de reparación recibe la lista de requisitos que
   fallaron, no un solo target.
4. **Un solo netlist para etapas encadenadas.** Cada topología del catálogo
   pasa a ser un `.subckt` con puertos de entrada y salida; el diseño
   conecta las instancias que el orquestador identificó como una cascada.
   Los requisitos se miden sobre cualquier nodo del circuito compuesto — no
   hay "requisito del bloque 1" y "requisito del bloque 2" simulados aparte.

Consecuencia directa del principio 4: **el LLM de escritura sale de los
bloques del catálogo.** Con `.subckt` deterministas, la sustitución de
parámetros ya resuelve la síntesis; es también la vía que hoy puede escribir
`V2 = +3` cuando el LLM "mejora" un netlist que no necesitaba tocar
(`escritura/node.py`, camino `iteration == 0 and chat_model is not None`
para bloques `catalog`). El LLM de escritura queda reservado exclusivamente
a `generic` — que ya lo necesita para autoría, no para reescritura de
plantillas.

## Forma de los datos (dirección, no contrato final)

```
Requirement:
  measure: Literal["max", "min", "peak_to_peak", "dc", "current", "fc_-3db", "gain_at_freq", "ripple"]
  node: str                 # nodo o rama sobre el que se mide, en el circuito compuesto
  comparator: Literal["approx", "le", "ge"]
  value: float
  tolerance: float | None    # None hereda la tolerancia del diseño; explícita la sobreescribe

Block:
  id, type ("catalog" | "generic")
  params: fijos del usuario (prioridad) + huecos que el catálogo rellena como default declarado
  requirements: list[Requirement]     # reemplaza metric/target de a uno

CircuitSpec:
  blocks: list[Block]
  connections: list[(block_id.port, block_id.port)]   # nuevo: cómo se cablean en el .subckt compuesto
  tolerance: float   # default global; un Requirement puede pisarlo
```

Esto no es el schema final de Pydantic — es la forma que tiene que sobrevivir
al plan de implementación. El detalle de nombres de nodo, cómo el orquestador
resuelve `node` a partir de lenguaje natural, y cómo `find_unresolved_placeholders`
se adapta al `.subckt`, se cierran en el plan.

## Cómo encaja en la arquitectura actual

- **Esquema** (`orquestador/schema.py`) — `CatalogParams`/`GenericParams`
  ganan `requirements: list[Requirement]` en vez de `metric`/`target` sueltos.
  `CircuitSpec` gana `connections`. Los objetos actuales de bloque único
  siguen siendo válidos como el caso `requirements` de longitud 1 y
  `connections` vacío — no hay migración de datos porque no hay estado
  persistido con el esquema viejo fuera de `evaluacion/banco.yaml`.
- **Orquestador** — al extraer `request_text`, identifica no solo el/los
  bloque(s) y sus parámetros, sino también las conexiones entre ellos y qué
  requisito corresponde a qué nodo del circuito compuesto. El
  `pensamiento_ingenieril` ya pedía distinguir "topología del catálogo" de
  "composición en cascada" — este diseño le da un lugar en el esquema a esa
  distinción en vez de dejarla solo en el razonamiento libre.
- **Cálculo** (`calculo/`) — sigue resolviendo fórmulas cerradas por bloque
  curado; lo que cambia es que el resultado se sustituye en un `.subckt`
  parametrizado en vez de en una plantilla de circuito completo.
- **Escritura** (`escritura/netlist.py`, `escritura/node.py`) — un
  `NETLIST_BUILDER` por tipo curado devuelve un `.subckt`, no un circuito
  top-level; un ensamblador nuevo arma el netlist compuesto a partir de
  `connections` y añade las fuentes/cargas de nivel superior. El camino LLM
  para bloques `catalog` en `iteration == 0` se elimina.
- **Shell** (`shell/node.py`, `shell/ngspice_runner.py`) — sigue sin cambios
  de fondo: corre ngspice sobre *un* netlist y lee mediciones. Lo que cambia
  es que ahora hay un netlist por diseño completo, no uno por bloque, y
  `.meas` puede haber varios (uno por `Requirement`).
- **Curador** (`curador/reward.py`, `curador/policy.py`, `curador/node.py`,
  `curador/reparacion.py`) — `build_measurements` deja de indexar por
  `block["goal"]["metric"]` (uno por bloque) y pasa a indexar por
  `Requirement` (varios por bloque, y por diseño). El ajuste recalibra la
  consigna del requisito que falló y vuelve a resolver/simular; para
  `generic`, `reparacion.py` recibe la lista de requisitos incumplidos, no
  un único `metric`/`target`.
- **Documentador** — sin cambios de fondo; resume el netlist final, que ahora
  puede tener más de un `.subckt` instanciado.
- **Evaluación** (`evaluacion/banco.yaml`, `corredor.py`, `metricas.py`) — el
  banco pasa a tener `referencia` por requisito, no un solo
  `metric`/`target`/`components`. Los ejemplos del usuario (1–16 más el
  combinado de orquestador→cálculo→validación) son el banco de este
  capítulo.

## Qué NO cambia

- ngspice sigue siendo el árbitro: ningún requisito se acepta por plausible,
  se mide.
- La recompensa sigue siendo `R = -Σ wᵢ·APEᵢ + β·c - γ·n`; solo cambia sobre
  qué conjunto suma (requisitos, no bloques).
- El camino curado sigue siendo determinista sin ningún LLM configurado.
- Los tipos curados (`voltage_divider`, `rc_lowpass`, `led_resistor`,
  `noninverting_amp`) no ganan tipos nuevos en este diseño.

## Fuera de alcance (fase 3, futura)

- Restricciones de componentes (series E12/E24, "resistencias comerciales",
  rangos) y ajuste a valores comerciales con re-verificación.
- Objetivos de optimización ("consumo mínimo") — necesita una función objetivo
  distinta a la recompensa de error/convergencia actual.
- Reentrenar o afinar el modelo — este diseño sigue siendo prompting +
  verificación, no aprendizaje.

## Criterio de terminado

1. El ejemplo del Zener (9 V, carga ≤ 50 mA) se especifica como un requisito
   `approx` más uno `le` sobre el mismo bloque, y el peor caso (carga máxima,
   entrada mínima) se verifica explícitamente, no en un único punto de
   operación.
2. Los ejemplos 13–16 (filtro+ampli, filtro+divisor, diodo+filtro) y el
   prompt combinado ("filtro pasa-altas + ganancia 4, error < 5 %") producen
   un único netlist compuesto vía `connections`, y ambos requisitos
   (frecuencia de corte del filtro, ganancia a la salida del amplificador) se
   miden sobre ese mismo netlist.
3. Un dato fijo del usuario (ej. `C = 100 nF`) nunca es reemplazado por el
   default del catálogo, y si el catálogo rellena un hueco, el supuesto queda
   reportado (en `verdict` o en la documentación del bloque).
4. Un diseño con dos requisitos, uno de los cuales falla, dispara un ajuste
   que recalibra solo la consigna del requisito que falló y vuelve a simular
   el circuito completo.
5. Sin LLM configurado, el camino curado con requisitos múltiples y
   composición sigue funcionando end-to-end (los `.subckt` son deterministas).
6. `evaluacion/banco.yaml` corre con los ejemplos 1–16 y reporta por
   requisito, no por bloque.
