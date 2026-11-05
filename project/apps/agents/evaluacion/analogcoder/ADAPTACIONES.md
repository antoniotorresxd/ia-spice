# Adaptaciones de los verificadores de AnalogCoder

Los scripts de `verificacion/` son los originales de AnalogCoder, sin cambios
(commit en `COMMIT`). `verificacion_adaptada/` es una copia en la que solo se
cambia **cómo** el verificador se conecta al circuito, nunca **qué** exige:
los umbrales, las señales de prueba y las magnitudes medidas son las mismas.

Toda corrida se califica con los dos y se reportan ambos resultados
(`Pass@1` y `Pass@1 adapt.`). Las dos condiciones —LLM solo y sistema— se
califican con los mismos verificadores.

| Id | Verificador | Qué hace el original | Cambio | ¿Cambia el criterio? |
|---|---|---|---|---|
| A1 | Oscillator (16, 17) | Lee las entradas del op-amp (`pins[0]`, `pins[1]`) como nodos para fijarles una condición inicial y graficarlas. Si una está en tierra (`0`) truena con `IndexError: 0` antes de juzgar la oscilación. | Una entrada en tierra se omite de la condición inicial y se grafica como 0 V. | No. Se juzga igual: amplitud > 1 µV y periodo estable (desv. < 20 % del periodo medio). |
| A2 | Integrator (18), Differentiator (19) | Fija una resistencia a 10 kΩ y un condensador a 3 µF y deja el resto del diseño intacto. En un integrador o diferenciador práctico eso rompe la relación entre resistencias del diseño (Rf/Rin, la que limita la ganancia en continua o en alta frecuencia). | Las demás resistencias se escalan en la misma proporción que la que fija el verificador, para conservar las relaciones del diseño. | No. Mismas señales de prueba, misma pendiente esperada (±30 %), misma forma de onda cuadrada (±20 %), misma prueba de que sin el op-amp deja de funcionar. |
| A3 | Integrator (18) | El transitorio arranca del nivel bajo del pulso. Con la Rf de un integrador práctico, la salida arranca en Adc·0.5 V y su descarga (τ = Rf·Cf) se suma a la pendiente medida. | El transitorio arranca del punto de operación con la entrada en su valor de continua, el `dc {bias}` que el propio verificador le asigna a la fuente. Si no se puede calcular, se simula como el original. | No. La pendiente se mide en el mismo tramo y con la misma tolerancia. |

Sin adaptación: Adder (20), Subtractor (21) y Schmitt (22). Sus verificadores
no suponen nada de la estructura interna del circuito.

## Controles

- Los 7 diseños de referencia de AnalogCoder pasan con los dos verificadores.
- Circuitos incorrectos siguen reprobando con el adaptado (pruebas
  automáticas): un amplificador inversor que no oscila (16), un RC pasivo
  con seguidor (18) y un CR pasivo con seguidor (19).
- Las 105 respuestas guardadas del LLM solo (Gemini 3.5 Flash Lite, Claude
  Haiku 5.5, GPT-6 Luna; 7 tareas × 5 corridas) dan **el mismo resultado con
  los dos verificadores**: las adaptaciones no favorecen a ninguna condición.

## Lo que no se adapta

- Nombres de componentes que pide el enunciado ("resistor R1 and capacitor
  Cf"). Es un requisito: el sistema los respeta (campo `nombres` de los
  bloques de catálogo) y el verificador los busca tal cual.
- Alimentación única de 5 V ("Assume the Vdd = 5.0 V"): la reciben las dos
  condiciones en el enunciado.

Para recalificar corridas ya guardadas, sin llamar a ningún modelo:

```bash
uv run python -m agents.evaluacion.analogcoder recalificar evaluacion/resultados/analogcoder-<fecha> [...]
```
