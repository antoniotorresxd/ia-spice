# Pendientes tuyos

Cosas que **no puedo hacer yo** y que quedan esperándote. Separadas de lo que
falta del proyecto, que va al final.

Última actualización: 2026-08-25.

---

## 1. Preparar la base de datos

Nunca ejecuto comandos de base de datos. Desde `project/`:

```bash
bun run db:setup
```

Corre las migraciones de Drizzle y luego crea las tablas del checkpointer. Es
un comando nuevo; antes solo existía `db:migrate` dentro de `apps/server`.

**Antes hace falta** que `project/apps/agents/.env` tenga la cadena de conexión:

```
CHECKPOINTER_URL=postgresql://usuario:clave@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require&options=-c%20search_path%3Dagents
```

Dos detalles que cuestan una tarde si se pasan por alto:

- **Endpoint directo, no el `-pooler`.** El pooler de Neon corre PgBouncer en
  modo transacción y psycopg prepara sentencias por omisión; la combinación
  falla de forma intermitente.
- **Conserva el `search_path=agents`.** Aísla las tablas del checkpointer en su
  propio esquema para que las migraciones de LangGraph y las de Drizzle no se
  estorben.

Sin esta variable el sistema funciona igual, pero una corrida interrumpida se
pierde en lugar de poder retomarse.

## 2. Limpiar la caché de Docker

Una imagen intermedia del servidor llegó a contener el `.env` con secretos
reales antes de que añadiera el `.dockerignore`. La imagen ya está corregida y
verificada, pero la caché de construcción puede conservar esa capa:

```bash
docker builder prune
```

## 3. Conectar un LLM

Hay tres cosas bloqueadas hasta que haya un proveedor configurado en la
pantalla de Configuración:

- La entrada en **lenguaje natural**. Hoy todo lo que corre —evaluación
  incluida— entra por `circuit_spec` estructurado.
- La **línea base best-of-N**, que el objetivo específico 6 exige
  explícitamente para comparar contra el sistema.
- Las pruebas marcadas `live_llm`, que hoy se saltan (6 de ellas).

## 4. Correr las pruebas de base de datos del servidor

Están gateadas y necesitan **las dos** variables, o se saltan en silencio —y un
test saltado no prueba nada. Son 25 hoy:

```bash
RUN_DB_TESTS=1 TEST_USER_ID=<id-real-de-la-tabla-user> bun test
```

El `TEST_USER_ID` tiene que existir de verdad en la tabla `user`.

## 5. Dos decisiones de calibración que son tuyas

**La tolerancia del banco de evaluación.** Hoy son 5 % y el lazo del curador
casi no interviene: 1.10 iteraciones de media, 18 de 20 casos convergen a la
primera. Un sinodal puede objetar con razón que si el lazo apenas trabaja, no
has demostrado que aporte —y el lazo es tu aportación central.

Mi recomendación: bajar a 1 % las familias LED y amplificador, justificándolo
por la precisión típica en diseño analógico y **no** por lo que le hace a los
números. No lo cambié yo porque ajustar el banco después de ver los resultados
es exactamente cómo se amaña una evaluación.

**El margen de aceptación** (`accept_tolerance_slack`, hoy 1.5). Cuánto puede
un bloque salirse de su propia tolerancia y aún así entregarse. Subirlo acepta
más circuitos de forma temprana y sube la tasa de aceptación, pero la hace
menos honesta. Vive en `project/apps/agents/config/curador.yaml`.

## 6. Revisar y validar

Fusioné todo a `dev` según me pediste, con revisión de spec y de calidad por
tarea. Queda tu revisión, sobre todo de:

- La función de recompensa y su calibración, que es la aportación de la tesina.
- El banco de 20 circuitos: que los casos estén bien planteados como problemas
  de ingeniería, no solo que el código los procese.

---

## Lo que falta del proyecto

Estado por fase del diseño de la iteración
([spec](superpowers/specs/2026-08-19-cierre-de-la-tesina-design.md)):

| Fase | Estado |
|---|---|
| **1 — Curador formalizado** | ✅ Completa |
| **2 — Amplificador con macromodelo** | ✅ Completa |
| **3 — Cálculo híbrido** | ⬜ Sin empezar |
| **4 — Infraestructura** | 🟡 Docker ✅, checkpointer ✅, **API keys pendiente**, contenedor del cliente pendiente |
| **5 — Evaluación experimental** | 🟡 Núcleo ✅ (MAPE, tasas, banco de 20), **best-of-N pendiente** (necesita LLM) |
| **6 — Correcciones a la tesina** | ⬜ Sin empezar |

### Detalle de lo que queda

**Fase 3 — Cálculo híbrido.** El LLM propone los valores de los componentes con
las ecuaciones de diseño en contexto, y la fórmula cerrada los verifica; si la
desviación supera un umbral, gana la fórmula y se registra la discrepancia.
Sostiene la afirmación del marco teórico de que el LLM interviene en dos puntos,
y produce una métrica publicable: **qué tan seguido acierta el modelo por su
cuenta**. Se puede construir y probar con un modelo falso, como ya se hace con
el orquestador.

**Fase 4 — Lo que queda.** Las API keys de usuario (plugin `apiKey` de
better-auth, con emisión y revocación desde la interfaz): cierran el caso de uso
y el control de seguridad que la tesina describe en dos capítulos y que hoy no
existe. El contenedor del cliente es menor: su build necesita los tipos que
genera el servidor, así que la imagen tiene que compilar ambas aplicaciones.

**Fase 5 — Best-of-N.** Pedir al modelo N netlists para la misma descripción,
sin realimentación, simularlos y quedarse con el mejor, comparando a igual
presupuesto de llamadas. Es la comparación que el objetivo 6 exige.

**Fase 6 — La tesina.** Las correcciones que levantó la
[auditoría](auditoria-tesina-vs-codigo.md) y los capítulos vacíos:

- Reescribir "circuitos de varias etapas" como sub-bloques independientes.
- Corregir `npm` por el workspace de Bun.
- Recortar la figura del espacio de trabajo: hoy muestra consumo de tokens,
  costo y archivos `.csv`/`.svg` que son datos de fixture, no del sistema.
- Enumerar los criterios de aceptación CA-01 a CA-07 como apéndice.
- Escribir **Pruebas** con los resultados de la evaluación, y **Gestión** y
  **Conclusiones**, que están en 0 bytes.
