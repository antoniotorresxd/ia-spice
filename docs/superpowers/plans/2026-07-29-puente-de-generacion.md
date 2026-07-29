# El puente de generación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un usuario escriba una solicitud en lenguaje natural en la interfaz web y vea el netlist resultante, persistido y recuperable tras recargar.

**Architecture:** El server (Hono + Drizzle + Postgres) es dueño de todo el estado y expone un módulo `workspace` con proyectos, conversaciones, mensajes, ejecuciones y artefactos. Al recibir una solicitud crea la ejecución en `active`, responde de inmediato y dispara sin esperar una llamada HTTP a agents, que se expone con un FastAPI mínimo. El client implementa `WorkspaceService` sobre HTTP y resondea mientras la ejecución siga `active`.

**Tech Stack:** Hono (`OpenAPIHono`), Drizzle ORM sobre Neon Postgres, Zod, `bun test`. FastAPI + uvicorn sobre LangGraph. React 19 + Vite + Vitest.

Diseño de referencia: [`docs/superpowers/specs/2026-07-29-puente-de-generacion-design.md`](../specs/2026-07-29-puente-de-generacion-design.md)

---

## Entorno: léelo antes de la primera tarea

**1. `bun` sobre la ruta UNC está roto.** Los symlinks de `node_modules` no resuelven desde `\\wsl.localhost\...`. Todo comando de bun o uv se ejecuta con el bun/uv nativo de WSL:

```bash
wsl.exe -e bash -lc "cd '/home/antonioxd/projects/spice/project/apps/server' && bun test"
```

Los comandos de este plan se escriben en su forma corta (`bun test ...`); envuélvelos así al ejecutarlos.

**2. No se usan git worktrees.** Se trabaja directo en la rama `dev`.

**3. Claude nunca ejecuta comandos de base de datos.** El usuario corre `db:generate`, `db:migrate` y `db:push`. La Tarea 1 termina en una **PARADA** explícita: no continúes a la Tarea 2 hasta que el usuario confirme que la migración corrió.

**4. Los tests de base de datos están gateados.** Necesitan **las dos** variables o se saltan en silencio, y un test saltado no prueba nada:

```bash
RUN_DB_TESTS=1 TEST_USER_ID=<id-real-de-la-tabla-user> bun test
```

**5. Hono solo mete una ruta en `AppType` si el router se construye como una sola expresión encadenada.** Rutas añadidas como sentencias sueltas (`router.get(...)` en su propia línea) funcionan en tiempo de ejecución pero quedan invisibles para los tipos.

**6. Tras cambiar rutas del server, el client necesita `bun run build:server-types`** o sigue compilando contra la API vieja. En este plan el client usa `fetch` con rutas en texto, no el cliente RPC, así que no depende de esos tipos — pero el `prebuild` del client los regenera igual.

## Dos desviaciones del spec, deliberadas

Ambas simplifican y ninguna cambia el comportamiento que el spec exige. Están aquí para que no parezcan descuidos.

**1. Los artefactos pertenecen a la conversación, no a la ejecución.** El spec ponía `artifact.executionId`. Con eso, `conversationDetail.files` ("artefactos de la última ejecución que haya terminado") y `project.fileCount` exigen una función de ventana o un lateral join para localizar esa ejecución. Colgando el artefacto de la conversación y **reemplazando** el conjunto cuando una corrida termina, se obtiene exactamente el mismo comportamiento observable —mientras una corrida está `active` siguen viéndose los artefactos anteriores— con un `WHERE conversation_id = ?`. Se pierde el histórico de netlists por ejecución, que nadie consume: `WorkspaceFile` no tiene referencia a la ejecución y la pantalla de Archivos está fuera de alcance. El rastro que sí importa, el `history` del curador, se conserva en `execution`.

**2. No hay transacción al crear una conversación.** El driver `drizzle-orm/neon-http` no soporta transacciones interactivas: cada sentencia es una petición HTTP y no se puede usar el `id` devuelto por un `INSERT` dentro del mismo bloque. Los tres `INSERT` (conversación, mensaje, ejecución) van secuenciales. La mitigación es defensiva y está en el código: `toConversationDetail` sintetiza una ejecución `failed` cuando la conversación no tiene ninguna, así que un fallo a media creación produce una conversación visible y marcada como fallida en lugar de una pantalla rota.

## Estructura de archivos

**Server** — `project/apps/server/src/modules/workspace/`:

| Archivo | Responsabilidad |
|---|---|
| `workspace.model.ts` | Las cinco tablas Drizzle. Único archivo que define esquema. |
| `workspace.schemas.ts` | Validación Zod de los cuerpos, derivaciones puras (`deriveTitle`, `derivePreview`) y las vistas públicas que consume el client. |
| `workspace.context.ts` | `composeRequestText`: una función pura, el texto de los seguimientos. |
| `workspace.runner.ts` | El puente hacia agents: `startRun` con `fetch` y sumidero inyectables, más el mapeo puro del veredicto a estado, artefactos y mensaje. |
| `workspace.services.ts` | Acceso a datos y ensamblado de las vistas derivadas. |
| `workspace.index.ts` | El router, una sola expresión encadenada. |

Tests junto al código, como en `llm`: `workspace.schemas.test.ts`, `workspace.context.test.ts`, `workspace.runner.test.ts`, `workspace.routes.test.ts`, `workspace.services.test.ts` (gateado por `RUN_DB_TESTS`).

Se modifican: `src/db/schema.ts`, `src/app.ts`, `src/lib/env.ts`, `.env.example`.

**Agents** — `project/apps/agents/`: se crea `src/agents/api.py`, `tests/test_api.py`, `langgraph.json`; se modifican `pyproject.toml` y `.env.example`.

**Client** — `project/apps/client/src/features/workspace/`: se crea `services/http-workspace-service.ts` (+ test) y `model/use-conversation-polling.ts` (+ test); se modifican `services/mock-workspace-service.ts`, `components/ConversationScreen.tsx` y `src/App.tsx`.

## Fases

- **Fase A (tareas 1–10): el server completo.** Al terminar, `bun test` pasa y la API entera responde por `curl`. Generar todavía falla con elegancia porque agents no existe: la ejecución termina en `failed` con un mensaje legible.
- **Fase B (tareas 11–13): agents por HTTP.** Al terminar, server + agents juntos producen un netlist real.
- **Fase C (tareas 14–18): el client.** Al terminar se cumple el criterio de terminado completo.
- **Fase D (tarea 19): documentación.**

---

# Fase A — El server

### Task 1: Las cinco tablas

**Files:**
- Create: `project/apps/server/src/modules/workspace/workspace.model.ts`
- Modify: `project/apps/server/src/db/schema.ts`

Esta tarea **no tiene test**: es declaración de esquema, y lo que la verifica es la migración que genera el usuario. Las tareas 2 en adelante la ejercitan.

- [ ] **Step 1: Escribe el modelo**

Crea `project/apps/server/src/modules/workspace/workspace.model.ts`:

```ts
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth/auth.model";

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const EXECUTION_STATUSES = ["active", "completed", "failed"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const ARTIFACT_STATUSES = ["complete", "partial"] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const project = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_userId_idx").on(table.userId)],
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // SET NULL y no CASCADE: borrar un proyecto no debe borrar las
    // conversaciones que contenía, solo dejarlas sin proyecto.
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("conversation_userId_idx").on(table.userId),
    index("conversation_projectId_idx").on(table.projectId),
  ],
);

export const message = pgTable(
  "message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role", { enum: MESSAGE_ROLES }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("message_conversationId_idx").on(table.conversationId)],
);

// Una corrida del grafo. `history` guarda la traza que el curador ya emite
// (una fila por iteración con valores, métricas, evaluación y decisión); hoy
// nadie la lee, es el dataset de la política de RL que viene después.
export const execution = pgTable(
  "execution",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    status: text("status", { enum: EXECUTION_STATUSES }).notNull(),
    summary: text("summary").notNull().default(""),
    requestText: text("request_text").notNull(),
    verdict: jsonb("verdict"),
    normalizedSpec: jsonb("normalized_spec"),
    history: jsonb("history"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [index("execution_conversationId_idx").on(table.conversationId)],
);

// El netlist. Cuelga de la conversación, no de la ejecución: una corrida que
// termina reemplaza el conjunto entero, así que mientras una corrida está
// activa siguen viéndose los artefactos de la anterior.
export const artifact = pgTable(
  "artifact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    blockId: text("block_id").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    content: text("content").notNull(),
    status: text("status", { enum: ARTIFACT_STATUSES }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("artifact_conversationId_idx").on(table.conversationId)],
);
```

- [ ] **Step 2: Añade el módulo al agregador**

En `project/apps/server/src/db/schema.ts`, que hoy tiene dos líneas, añade la tercera:

```ts
export * from "../modules/auth/auth.model";
export * from "../modules/llm/llm.model";
export * from "../modules/workspace/workspace.model";
```

- [ ] **Step 3: Verifica que compila**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.model.ts project/apps/server/src/db/schema.ts
git commit -m "feat(server): schema del modulo workspace"
```

- [ ] **Step 5: PARADA — el usuario ejecuta la migración**

Dile al usuario, literalmente, que hace falta que corra:

```bash
cd project/apps/server && bun run db:generate && bun run db:migrate
```

`db:generate` **no debe preguntar** por renombrados: las cinco tablas son nuevas, no hay nada que renombrar. Si pregunta, algo está mal — paren y revisen antes de aplicar.

No continúes a la Tarea 2 hasta que el usuario confirme que la migración se aplicó.

---

### Task 2: Validación y derivaciones puras

**Files:**
- Create: `project/apps/server/src/modules/workspace/workspace.schemas.ts`
- Test: `project/apps/server/src/modules/workspace/workspace.schemas.test.ts`

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/server/src/modules/workspace/workspace.schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  createProjectSchema,
  derivePreview,
  deriveTitle,
  moveConversationSchema,
  submitTextSchema,
  truncate,
} from "./workspace.schemas";

describe("truncate", () => {
  test("deja el texto corto intacto", () => {
    expect(truncate("un divisor de 12V a 5V", 80)).toBe("un divisor de 12V a 5V");
  });

  test("colapsa saltos de línea y espacios repetidos", () => {
    expect(truncate("un divisor\n\n  de 12V", 80)).toBe("un divisor de 12V");
  });

  test("recorta y añade elipsis sin pasarse del máximo", () => {
    const result = truncate("abcdefghij", 5);
    expect(result).toBe("abcd…");
    expect(result.length).toBe(5);
  });
});

describe("deriveTitle y derivePreview", () => {
  test("el título usa el máximo de título", () => {
    expect(deriveTitle("x".repeat(200)).length).toBe(80);
  });

  test("el preview usa el máximo de preview", () => {
    expect(derivePreview("x".repeat(200)).length).toBe(120);
  });
});

describe("createProjectSchema", () => {
  test("la descripción por defecto es cadena vacía", () => {
    const parsed = createProjectSchema.parse({ name: "Filtros" });
    expect(parsed).toEqual({ name: "Filtros", description: "" });
  });

  test("rechaza el nombre vacío", () => {
    expect(createProjectSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("submitTextSchema", () => {
  test("rechaza texto vacío o solo espacios", () => {
    expect(submitTextSchema.safeParse({ text: "" }).success).toBe(false);
    expect(submitTextSchema.safeParse({ text: "   " }).success).toBe(false);
  });

  test("acepta y recorta los extremos", () => {
    expect(submitTextSchema.parse({ text: "  un divisor  " })).toEqual({
      text: "un divisor",
    });
  });
});

describe("moveConversationSchema", () => {
  test("projectId nulo es válido: saca la conversación de su proyecto", () => {
    expect(moveConversationSchema.parse({ projectId: null })).toEqual({ projectId: null });
  });

  test("rechaza projectId como cadena vacía", () => {
    expect(moveConversationSchema.safeParse({ projectId: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun test src/modules/workspace/workspace.schemas.test.ts`
Expected: FAIL — "Cannot find module './workspace.schemas'".

- [ ] **Step 3: Implementa**

Crea `project/apps/server/src/modules/workspace/workspace.schemas.ts`:

```ts
import { z } from "zod";

export const TITLE_MAX = 80;
export const PREVIEW_MAX = 120;

// Normaliza espacios antes de medir: un título con saltos de línea rompe el
// layout de la UI y falsea la longitud.
export function truncate(value: string, max: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function deriveTitle(firstUserText: string): string {
  return truncate(firstUserText, TITLE_MAX);
}

export function derivePreview(lastMessageContent: string): string {
  return truncate(lastMessageContent, PREVIEW_MAX);
}

export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const submitTextSchema = z.object({
  text: z.string().trim().min(1),
});

export type SubmitTextInput = z.infer<typeof submitTextSchema>;

// null saca la conversación de su proyecto; la cadena vacía no es un id.
export const moveConversationSchema = z.object({
  projectId: z.string().min(1).nullable(),
});

export type MoveConversationInput = z.infer<typeof moveConversationSchema>;
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `bun test src/modules/workspace/workspace.schemas.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.schemas.ts project/apps/server/src/modules/workspace/workspace.schemas.test.ts
git commit -m "feat(server): validacion y derivaciones del modulo workspace"
```

---

### Task 3: Las vistas públicas

**Files:**
- Modify: `project/apps/server/src/modules/workspace/workspace.schemas.ts`
- Modify: `project/apps/server/src/modules/workspace/workspace.schemas.test.ts`

Las vistas son funciones puras que convierten filas de Drizzle en la forma exacta que consume el client (`workspace-types.ts`). Van en `workspace.schemas.ts` por el mismo motivo que `toPublicConnection` vive en `llm.schemas.ts`.

- [ ] **Step 1: Escribe el test que falla**

Añade al final de `project/apps/server/src/modules/workspace/workspace.schemas.test.ts`:

```ts
import { toConversationDetail, toConversationSummary } from "./workspace.schemas";

const conversationRow = {
  id: "conv-1",
  userId: "user-1",
  projectId: null,
  title: "un divisor de 12V a 5V",
  createdAt: new Date("2026-07-29T12:00:00Z"),
  updatedAt: new Date("2026-07-29T12:00:05Z"),
};

const messageRows = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user" as const,
    content: "un divisor de 12V a 5V",
    createdAt: new Date("2026-07-29T12:00:00Z"),
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant" as const,
    content: "all blocks within tolerance",
    createdAt: new Date("2026-07-29T12:00:05Z"),
  },
];

const executionRow = {
  id: "exec-1",
  conversationId: "conv-1",
  status: "completed" as const,
  summary: "all blocks within tolerance",
  requestText: "un divisor de 12V a 5V",
  verdict: null,
  normalizedSpec: null,
  history: null,
  startedAt: new Date("2026-07-29T12:00:00Z"),
  finishedAt: new Date("2026-07-29T12:00:05Z"),
};

const artifactRow = {
  id: "art-1",
  conversationId: "conv-1",
  blockId: "block-1",
  name: "block-1.cir",
  language: "spice",
  content: "* divisor\nR1 in out 1k\n",
  status: "complete" as const,
  createdAt: new Date("2026-07-29T12:00:05Z"),
};

describe("toConversationSummary", () => {
  test("el preview es el último mensaje y el estado el de la ejecución", () => {
    expect(toConversationSummary(conversationRow, messageRows[1], executionRow)).toEqual({
      id: "conv-1",
      projectId: null,
      title: "un divisor de 12V a 5V",
      preview: "all blocks within tolerance",
      updatedAt: "2026-07-29T12:00:05.000Z",
      executionStatus: "completed",
    });
  });

  test("sin mensajes el preview queda vacío, no undefined", () => {
    expect(toConversationSummary(conversationRow, undefined, executionRow).preview).toBe("");
  });

  test("sin ejecución se reporta failed: la creación quedó a medias", () => {
    expect(toConversationSummary(conversationRow, messageRows[1], undefined).executionStatus).toBe(
      "failed",
    );
  });
});

describe("toConversationDetail", () => {
  test("arma mensajes, archivos y ejecución con fechas serializadas", () => {
    const detail = toConversationDetail(conversationRow, messageRows, [artifactRow], executionRow);
    expect(detail.messages).toEqual([
      { id: "msg-1", role: "user", content: "un divisor de 12V a 5V", createdAt: "2026-07-29T12:00:00.000Z" },
      { id: "msg-2", role: "assistant", content: "all blocks within tolerance", createdAt: "2026-07-29T12:00:05.000Z" },
    ]);
    expect(detail.files).toEqual([
      {
        id: "art-1",
        name: "block-1.cir",
        language: "spice",
        content: "* divisor\nR1 in out 1k\n",
        status: "complete",
      },
    ]);
    expect(detail.execution).toEqual({
      id: "exec-1",
      status: "completed",
      summary: "all blocks within tolerance",
    });
  });

  test("sin ejecución sintetiza una fallida en lugar de romperse", () => {
    const detail = toConversationDetail(conversationRow, messageRows, [], undefined);
    expect(detail.execution.status).toBe("failed");
    expect(detail.execution.summary).toBe("La ejecución no se pudo registrar.");
    expect(detail.executionStatus).toBe("failed");
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun test src/modules/workspace/workspace.schemas.test.ts`
Expected: FAIL — `toConversationSummary` no está exportado.

- [ ] **Step 3: Implementa**

Añade al final de `project/apps/server/src/modules/workspace/workspace.schemas.ts`:

```ts
import type { artifact, conversation, execution, message } from "./workspace.model";

type ConversationRow = typeof conversation.$inferSelect;
type MessageRow = typeof message.$inferSelect;
type ExecutionRow = typeof execution.$inferSelect;
type ArtifactRow = typeof artifact.$inferSelect;

// El driver neon-http no soporta transacciones interactivas, así que crear una
// conversación son tres INSERT seguidos. Si el proceso muere en medio, la
// conversación queda sin ejecución: se reporta como fallida en lugar de
// reventar la pantalla.
const MISSING_EXECUTION_SUMMARY = "La ejecución no se pudo registrar.";

export function toConversationSummary(
  row: ConversationRow,
  lastMessage: MessageRow | undefined,
  latestExecution: ExecutionRow | undefined,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    preview: lastMessage ? derivePreview(lastMessage.content) : "",
    updatedAt: row.updatedAt.toISOString(),
    executionStatus: latestExecution?.status ?? ("failed" as const),
  };
}

export function toConversationDetail(
  row: ConversationRow,
  messages: MessageRow[],
  artifacts: ArtifactRow[],
  latestExecution: ExecutionRow | undefined,
) {
  return {
    ...toConversationSummary(row, messages.at(-1), latestExecution),
    messages: messages.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt.toISOString(),
    })),
    files: artifacts.map((item) => ({
      id: item.id,
      name: item.name,
      language: item.language,
      content: item.content,
      status: item.status,
    })),
    execution: {
      id: latestExecution?.id ?? `${row.id}-execution`,
      status: latestExecution?.status ?? ("failed" as const),
      summary: latestExecution?.summary ?? MISSING_EXECUTION_SUMMARY,
    },
  };
}

export type ConversationSummaryView = ReturnType<typeof toConversationSummary>;
export type ConversationDetailView = ReturnType<typeof toConversationDetail>;
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `bun test src/modules/workspace/workspace.schemas.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.schemas.ts project/apps/server/src/modules/workspace/workspace.schemas.test.ts
git commit -m "feat(server): vistas publicas de conversaciones"
```

---

### Task 4: El texto de los seguimientos

**Files:**
- Create: `project/apps/server/src/modules/workspace/workspace.context.ts`
- Test: `project/apps/server/src/modules/workspace/workspace.context.test.ts`

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/server/src/modules/workspace/workspace.context.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { composeRequestText } from "./workspace.context";

const history = [
  { role: "user" as const, content: "un divisor de 12V a 5V" },
  { role: "assistant" as const, content: "all blocks within tolerance" },
];

describe("composeRequestText", () => {
  test("incluye la solicitud original, el spec previo y la instrucción nueva", () => {
    const spec = { blocks: [{ id: "block-1", type: "voltage_divider" }] };
    const result = composeRequestText(history, spec, "ahora a 3.3V");

    expect(result).toContain("Solicitud original: un divisor de 12V a 5V");
    expect(result).toContain('"type": "voltage_divider"');
    expect(result).toContain("Nueva instrucción: ahora a 3.3V");
  });

  test("respeta el orden: original, spec, instrucción nueva", () => {
    const result = composeRequestText(history, { blocks: [] }, "ahora a 3.3V");
    expect(result.indexOf("Solicitud original")).toBeLessThan(
      result.indexOf("Especificación resuelta"),
    );
    expect(result.indexOf("Especificación resuelta")).toBeLessThan(
      result.indexOf("Nueva instrucción"),
    );
  });

  test("toma como original el primer mensaje del usuario, no el del asistente", () => {
    const result = composeRequestText(
      [
        { role: "assistant", content: "hola" },
        { role: "user", content: "un filtro RC" },
      ],
      null,
      "sube la frecuencia",
    );
    expect(result).toContain("Solicitud original: un filtro RC");
    expect(result).not.toContain("hola");
  });

  test("sin spec previo omite ese bloque en lugar de escribir null", () => {
    const result = composeRequestText(history, null, "ahora a 3.3V");
    expect(result).not.toContain("Especificación resuelta");
    expect(result).not.toContain("null");
  });

  test("sin mensajes previos devuelve solo la instrucción nueva", () => {
    expect(composeRequestText([], null, "un divisor")).toBe("Nueva instrucción: un divisor");
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun test src/modules/workspace/workspace.context.test.ts`
Expected: FAIL — "Cannot find module './workspace.context'".

- [ ] **Step 3: Implementa**

Crea `project/apps/server/src/modules/workspace/workspace.context.ts`:

```ts
export type ContextMessage = { role: "user" | "assistant"; content: string };

// Un seguimiento como "ahora a 3.3V" no significa nada aislado. El server
// compone el texto que verá el orquestador; agents no cambia, sigue recibiendo
// un solo request_text.
export function composeRequestText(
  messages: ContextMessage[],
  lastSpec: unknown | null,
  newText: string,
): string {
  const parts: string[] = [];

  const firstUserMessage = messages.find((item) => item.role === "user");
  if (firstUserMessage) {
    parts.push(`Solicitud original: ${firstUserMessage.content}`);
  }

  if (lastSpec !== null && lastSpec !== undefined) {
    parts.push(
      `Especificación resuelta en la última corrida:\n${JSON.stringify(lastSpec, null, 2)}`,
    );
  }

  parts.push(`Nueva instrucción: ${newText}`);

  return parts.join("\n\n");
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `bun test src/modules/workspace/workspace.context.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.context.ts project/apps/server/src/modules/workspace/workspace.context.test.ts
git commit -m "feat(server): composicion del contexto de los seguimientos"
```

---

### Task 5: Traducir el resultado del grafo

**Files:**
- Create: `project/apps/server/src/modules/workspace/workspace.runner.ts`
- Test: `project/apps/server/src/modules/workspace/workspace.runner.test.ts`

Tres funciones puras. La forma del resultado sale de los nodos reales de agents: `netlists[blockId] = {path, text}` (`escritura/node.py`), `sim_results[blockId] = {metrics, sim_error}` (`shell/node.py`) y `verdict = {status, reason, best_iteration}` (`curador/node.py`).

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/server/src/modules/workspace/workspace.runner.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  type AgentsRunResult,
  mapVerdictToStatus,
  toArtifactDrafts,
  toAssistantMessage,
} from "./workspace.runner";

const accepted: AgentsRunResult = {
  verdict: { status: "accepted", reason: "all blocks within tolerance", best_iteration: 0 },
  normalized_spec: { blocks: [] },
  netlists: { "block-1": { path: "/tmp/circuit.cir", text: "* divisor\nR1 in out 1k\n" } },
  sim_results: { "block-1": { metrics: { v_out: 5.01 }, sim_error: null } },
  component_values: { "block-1": { r1: 1000, r2: 714 } },
  history: [],
  iteration: 0,
};

describe("mapVerdictToStatus", () => {
  test("accepted -> completed con el motivo del veredicto", () => {
    expect(mapVerdictToStatus(accepted.verdict)).toEqual({
      status: "completed",
      summary: "all blocks within tolerance",
    });
  });

  test("rejected -> failed: no obtuviste un circuito", () => {
    expect(
      mapVerdictToStatus({
        status: "rejected",
        reason: "goals not met after 5 iterations",
        best_iteration: 2,
      }),
    ).toEqual({ status: "failed", summary: "goals not met after 5 iterations" });
  });

  test("un rechazo por LLM sin configurar dice dónde configurarlo", () => {
    const result = mapVerdictToStatus({
      status: "rejected",
      reason: "llm_settings_unavailable: no assignment for orchestrator",
      best_iteration: null,
    });
    expect(result.status).toBe("failed");
    expect(result.summary).toContain("Configuración");
    expect(result.summary).not.toContain("llm_settings_unavailable");
  });

  test("sin veredicto -> failed, no se asume éxito", () => {
    expect(mapVerdictToStatus(null)).toEqual({
      status: "failed",
      summary: "La corrida terminó sin veredicto.",
    });
  });
});

describe("toArtifactDrafts", () => {
  test("un artefacto por netlist, con el texto y el nombre del bloque", () => {
    expect(toArtifactDrafts(accepted)).toEqual([
      {
        blockId: "block-1",
        name: "block-1.cir",
        language: "spice",
        content: "* divisor\nR1 in out 1k\n",
        status: "complete",
      },
    ]);
  });

  test("un bloque con error de simulación queda parcial", () => {
    const drafts = toArtifactDrafts({
      ...accepted,
      sim_results: { "block-1": { metrics: null, sim_error: "ngspice exited 1" } },
    });
    expect(drafts[0]!.status).toBe("partial");
  });

  test("sin netlists devuelve una lista vacía, no revienta", () => {
    expect(toArtifactDrafts({ ...accepted, netlists: {} })).toEqual([]);
  });
});

describe("toAssistantMessage", () => {
  test("incluye el resumen, las métricas medidas y las iteraciones", () => {
    const content = toAssistantMessage(accepted);
    expect(content).toContain("all blocks within tolerance");
    expect(content).toContain("block-1.v_out = 5.01");
    expect(content).toContain("Iteraciones: 1");
  });

  test("un bloque con error de simulación reporta el error en lugar de la métrica", () => {
    const content = toAssistantMessage({
      ...accepted,
      sim_results: { "block-1": { metrics: null, sim_error: "ngspice exited 1" } },
    });
    expect(content).toContain("block-1: ngspice exited 1");
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun test src/modules/workspace/workspace.runner.test.ts`
Expected: FAIL — "Cannot find module './workspace.runner'".

- [ ] **Step 3: Implementa**

Crea `project/apps/server/src/modules/workspace/workspace.runner.ts`:

```ts
import type { ArtifactStatus, ExecutionStatus } from "./workspace.model";

export type AgentsVerdict = {
  status: string;
  reason: string;
  best_iteration: number | null;
};

export type AgentsRunResult = {
  verdict: AgentsVerdict | null;
  normalized_spec: unknown | null;
  netlists: Record<string, { path: string; text: string }>;
  sim_results: Record<string, { metrics: Record<string, number> | null; sim_error: string | null }>;
  component_values: Record<string, Record<string, number>>;
  history: unknown[];
  iteration: number;
};

export type ArtifactDraft = {
  blockId: string;
  name: string;
  language: string;
  content: string;
  status: ArtifactStatus;
};

const LLM_UNAVAILABLE_PREFIX = "llm_settings_unavailable";
const LLM_UNAVAILABLE_SUMMARY =
  "No hay un modelo asignado al orquestador. Ve a Configuración → Modelos y providers.";
const NO_VERDICT_SUMMARY = "La corrida terminó sin veredicto.";

// Un circuito rechazado no es un error técnico, pero para la interfaz es un
// resultado fallido: no obtuviste un circuito. El motivo va en el resumen.
export function mapVerdictToStatus(verdict: AgentsVerdict | null): {
  status: Extract<ExecutionStatus, "completed" | "failed">;
  summary: string;
} {
  if (verdict?.status === "accepted") {
    return { status: "completed", summary: verdict.reason };
  }
  if (verdict?.status === "rejected") {
    return {
      status: "failed",
      summary: verdict.reason.startsWith(LLM_UNAVAILABLE_PREFIX)
        ? LLM_UNAVAILABLE_SUMMARY
        : verdict.reason,
    };
  }
  return { status: "failed", summary: NO_VERDICT_SUMMARY };
}

export function toArtifactDrafts(result: AgentsRunResult): ArtifactDraft[] {
  return Object.entries(result.netlists ?? {}).map(([blockId, netlist]) => ({
    blockId,
    name: `${blockId}.cir`,
    language: "spice",
    content: netlist.text,
    // parcial cuando ngspice no pudo medir ese bloque: el netlist existe,
    // la validación no
    status: result.sim_results?.[blockId]?.sim_error == null ? "complete" : "partial",
  }));
}

export function toAssistantMessage(result: AgentsRunResult): string {
  const { summary } = mapVerdictToStatus(result.verdict);

  const lines = Object.entries(result.sim_results ?? {}).flatMap(([blockId, sim]) =>
    sim.metrics
      ? Object.entries(sim.metrics).map(([metric, value]) => `${blockId}.${metric} = ${value}`)
      : [`${blockId}: ${sim.sim_error}`],
  );

  // iteration es 0-based en CircuitState; lo que interesa es cuántas corrió
  const iterations = `Iteraciones: ${result.iteration + 1}`;

  return lines.length > 0
    ? `${summary}\n\n${lines.join("\n")}\n${iterations}`
    : `${summary}\n\n${iterations}`;
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `bun test src/modules/workspace/workspace.runner.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.runner.ts project/apps/server/src/modules/workspace/workspace.runner.test.ts
git commit -m "feat(server): traduccion del resultado del grafo"
```

---

### Task 6: La llamada a agents

**Files:**
- Modify: `project/apps/server/src/modules/workspace/workspace.runner.ts`
- Modify: `project/apps/server/src/modules/workspace/workspace.runner.test.ts`
- Modify: `project/apps/server/src/lib/env.ts`
- Modify: `project/apps/server/.env.example`

`startRun` recibe el `fetch` y un **sumidero** inyectables. Sin el sumidero habría que tener base de datos para probar la llamada; con él, todo el camino de red se prueba en memoria y la escritura queda cubierta por los tests gateados de la Tarea 9.

- [ ] **Step 1: Añade las variables de entorno**

En `project/apps/server/src/lib/env.ts`, dentro de `EnvSchema`, justo después de `AGENTS_SERVICE_TOKEN`:

```ts
  AGENTS_SERVICE_TOKEN: z.string().min(16),
  // Dirección contraria a AGENTS_SERVICE_TOKEN: con este el server llama a
  // agents. Son dos secretos distintos a propósito; si se filtra uno, el otro
  // sigue valiendo.
  AGENTS_BASE_URL: z.string().default("http://localhost:8000"),
  AGENTS_API_TOKEN: z.string().min(16),
```

En `project/apps/server/.env.example`, junto a `AGENTS_SERVICE_TOKEN`:

```
# Token con el que agents consulta al server (mismo valor en apps/agents/.env)
AGENTS_SERVICE_TOKEN=

# Dónde escucha el entrypoint FastAPI de agents, y el token con el que el
# server lo llama. Distinto de AGENTS_SERVICE_TOKEN: va en la otra dirección.
# Genéralo con: openssl rand -hex 32
AGENTS_BASE_URL=http://localhost:8000
AGENTS_API_TOKEN=
```

- [ ] **Step 2: Escribe el test que falla**

Añade al final de `project/apps/server/src/modules/workspace/workspace.runner.test.ts`:

```ts
import { startRun, type RunSink } from "./workspace.runner";

function recordingSink() {
  const results: AgentsRunResult[] = [];
  const failures: string[] = [];
  const sink: RunSink = {
    async onResult(result) {
      results.push(result);
    },
    async onFailure(summary) {
      failures.push(summary);
    },
  };
  return { sink, results, failures };
}

describe("startRun", () => {
  test("manda user_id y request_text al endpoint de agents con el bearer", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(accepted), { status: 200 });
    };
    const { sink, results } = recordingSink();

    await startRun(
      { userId: "user-1", requestText: "un divisor de 12V a 5V" },
      sink,
      fakeFetch as unknown as typeof fetch,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toEndWith("/runs");
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toStartWith("Bearer ");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      user_id: "user-1",
      request_text: "un divisor de 12V a 5V",
    });
    expect(results).toEqual([accepted]);
  });

  test("una respuesta no-2xx falla sin filtrar el cuerpo del error", async () => {
    const fakeFetch = async () => new Response("stack trace interno", { status: 500 });
    const { sink, results, failures } = recordingSink();

    await startRun({ userId: "user-1", requestText: "x" }, sink, fakeFetch as unknown as typeof fetch);

    expect(results).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBe("No pudimos ejecutar el diseño. Inténtalo de nuevo.");
  });

  test("agents inalcanzable falla sin propagar la excepción", async () => {
    const fakeFetch = async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:8000");
    };
    const { sink, failures } = recordingSink();

    await startRun({ userId: "user-1", requestText: "x" }, sink, fakeFetch as unknown as typeof fetch);

    expect(failures[0]).toBe("No pudimos ejecutar el diseño. Inténtalo de nuevo.");
  });

  test("un cuerpo que no es JSON también falla con el mensaje neutro", async () => {
    const fakeFetch = async () => new Response("<html>502</html>", { status: 200 });
    const { sink, failures } = recordingSink();

    await startRun({ userId: "user-1", requestText: "x" }, sink, fakeFetch as unknown as typeof fetch);

    expect(failures[0]).toBe("No pudimos ejecutar el diseño. Inténtalo de nuevo.");
  });
});
```

- [ ] **Step 3: Corre el test y verifica que falla**

Run: `bun test src/modules/workspace/workspace.runner.test.ts`
Expected: FAIL — `startRun` no está exportado.

- [ ] **Step 4: Implementa**

Añade al final de `project/apps/server/src/modules/workspace/workspace.runner.ts`, y añade el import de `env` arriba:

```ts
import env from "@/lib/env";
```

```ts
// El sumidero se inyecta para que todo el camino de red se pruebe en memoria:
// sin él, comprobar la forma de la petición exigiría una base de datos.
export type RunSink = {
  onResult(result: AgentsRunResult): Promise<void>;
  onFailure(summary: string): Promise<void>;
};

const RUN_FAILURE_SUMMARY = "No pudimos ejecutar el diseño. Inténtalo de nuevo.";

export async function startRun(
  input: { userId: string; requestText: string },
  sink: RunSink,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const response = await fetchImpl(`${env.AGENTS_BASE_URL}/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.AGENTS_API_TOKEN}`,
      },
      body: JSON.stringify({ user_id: input.userId, request_text: input.requestText }),
    });

    if (!response.ok) {
      // El cuerpo del error puede traer detalles internos: no se propaga.
      await sink.onFailure(RUN_FAILURE_SUMMARY);
      return;
    }

    const result = (await response.json()) as AgentsRunResult;
    await sink.onResult(result);
  } catch {
    await sink.onFailure(RUN_FAILURE_SUMMARY);
  }
}
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `bun test src/modules/workspace/workspace.runner.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: PARADA — el usuario añade el token a su `.env`**

`AGENTS_API_TOKEN` no tiene default y el server no arranca sin él. Pide al usuario que genere uno y lo ponga en `project/apps/server/.env`:

```bash
openssl rand -hex 32
```

Ese mismo valor irá en `project/apps/agents/.env` en la Tarea 12.

- [ ] **Step 7: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.runner.ts project/apps/server/src/modules/workspace/workspace.runner.test.ts project/apps/server/src/lib/env.ts project/apps/server/.env.example
git commit -m "feat(server): llamada a agents con fetch y sumidero inyectables"
```

---

### Task 7: Servicios de proyectos

**Files:**
- Create: `project/apps/server/src/modules/workspace/workspace.services.ts`
- Test: `project/apps/server/src/modules/workspace/workspace.services.test.ts`

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/server/src/modules/workspace/workspace.services.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";

import { createProject, deleteProject, getProjectDetail, listProjectViews } from "./workspace.services";

// Integración real contra la BD (Neon). Correr con:
//   RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test
const runDb = process.env.RUN_DB_TESTS === "1";
const t = test.skipIf(!runDb);

// Debe existir en la tabla `user` cuando se ejecuten los tests de BD.
const TEST_USER_ID = process.env.TEST_USER_ID ?? "test-user-00000000";
const OTHER_USER_ID = "test-user-ajeno";

const createdProjectIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdProjectIds) {
    await deleteProject(TEST_USER_ID, id).catch(() => {});
  }
});

describe("proyectos (db)", () => {
  t("create/list/get roundtrip con fileCount en cero", async () => {
    const created = await createProject(TEST_USER_ID, {
      name: `Filtros ${Date.now()}`,
      description: "pruebas",
    });
    createdProjectIds.push(created.id);

    expect(created.userId).toBe(TEST_USER_ID);

    const listed = await listProjectViews(TEST_USER_ID);
    const found = listed.find((item) => item.id === created.id);
    expect(found).toBeDefined();
    expect(found!.fileCount).toBe(0);
    expect(found!.conversationIds).toEqual([]);

    const detail = await getProjectDetail(TEST_USER_ID, created.id);
    expect(detail!.name).toBe(created.name);
    expect(detail!.conversations).toEqual([]);
  });

  t("el proyecto de otro usuario no se ve", async () => {
    const created = await createProject(TEST_USER_ID, { name: `Ajeno ${Date.now()}`, description: "" });
    createdProjectIds.push(created.id);

    expect(await getProjectDetail(OTHER_USER_ID, created.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun test src/modules/workspace/workspace.services.test.ts`
Expected: FAIL — "Cannot find module './workspace.services'".

- [ ] **Step 3: Implementa**

Crea `project/apps/server/src/modules/workspace/workspace.services.ts`:

```ts
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";

import { artifact, conversation, execution, message, project } from "./workspace.model";
import {
  toConversationSummary,
  type ConversationSummaryView,
  type CreateProjectInput,
} from "./workspace.schemas";

export async function createProject(userId: string, input: CreateProjectInput) {
  const [row] = await db
    .insert(project)
    .values({ userId, name: input.name, description: input.description })
    .returning();
  return row!;
}

export async function deleteProject(userId: string, id: string) {
  const [row] = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .returning();
  return row ?? null;
}

// Cuenta artefactos por proyecto en una sola consulta. Los artefactos cuelgan
// de la conversación, así que basta un join; no hace falta localizar la última
// ejecución de cada una.
async function countArtifactsByProject(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      projectId: conversation.projectId,
      total: sql<number>`count(${artifact.id})::int`,
    })
    .from(conversation)
    .leftJoin(artifact, eq(artifact.conversationId, conversation.id))
    .where(eq(conversation.userId, userId))
    .groupBy(conversation.projectId);

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.projectId) counts.set(row.projectId, row.total);
  }
  return counts;
}

export type ProjectView = {
  id: string;
  name: string;
  description: string;
  conversationIds: string[];
  fileCount: number;
  updatedAt: string;
};

export async function listProjectViews(userId: string): Promise<ProjectView[]> {
  const [projects, conversations, fileCounts] = await Promise.all([
    db.select().from(project).where(eq(project.userId, userId)).orderBy(desc(project.updatedAt)),
    db
      .select({ id: conversation.id, projectId: conversation.projectId })
      .from(conversation)
      .where(eq(conversation.userId, userId))
      .orderBy(desc(conversation.updatedAt)),
    countArtifactsByProject(userId),
  ]);

  return projects.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    conversationIds: conversations
      .filter((item) => item.projectId === row.id)
      .map((item) => item.id),
    fileCount: fileCounts.get(row.id) ?? 0,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getProjectDetail(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);
  if (!row) return null;

  const views = await listProjectViews(userId);
  const view = views.find((item) => item.id === id)!;
  const summaries = await listConversationSummaries(userId);

  return {
    ...view,
    conversations: view.conversationIds
      .map((conversationId) => summaries.find((item) => item.id === conversationId))
      .filter((item): item is ConversationSummaryView => item !== undefined),
  };
}

// Resumen de todas las conversaciones del usuario. Se reduce en memoria a
// propósito: el volumen es el de una cuenta, no el de un catálogo, y evita una
// función de ventana por cada campo derivado.
export async function listConversationSummaries(
  userId: string,
): Promise<ConversationSummaryView[]> {
  const conversations = await db
    .select()
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt));

  if (conversations.length === 0) return [];

  const ids = conversations.map((row) => row.id);
  const [messages, executions] = await Promise.all([
    db
      .select()
      .from(message)
      .where(inArray(message.conversationId, ids))
      .orderBy(asc(message.createdAt)),
    db
      .select()
      .from(execution)
      .where(inArray(execution.conversationId, ids))
      .orderBy(asc(execution.startedAt)),
  ]);

  return conversations.map((row) => {
    const own = messages.filter((item) => item.conversationId === row.id);
    const runs = executions.filter((item) => item.conversationId === row.id);
    return toConversationSummary(row, own.at(-1), runs.at(-1));
  });
}
```

- [ ] **Step 4: Corre el test con base de datos y verifica que pasa**

Run: `RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/workspace/workspace.services.test.ts`
Expected: PASS, 2 tests. Si dice "2 skipped", faltó una de las dos variables y no has probado nada.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.services.ts project/apps/server/src/modules/workspace/workspace.services.test.ts
git commit -m "feat(server): servicios de proyectos"
```

---

### Task 8: Servicios de conversaciones

**Files:**
- Modify: `project/apps/server/src/modules/workspace/workspace.services.ts`
- Modify: `project/apps/server/src/modules/workspace/workspace.services.test.ts`

- [ ] **Step 1: Escribe el test que falla**

Añade a `project/apps/server/src/modules/workspace/workspace.services.test.ts` (y añade los nuevos nombres al `import` de arriba):

```ts
import {
  appendUserMessage,
  createConversationWithRequest,
  deleteConversation,
  getConversationDetail,
  getSnapshot,
  moveConversation,
} from "./workspace.services";

const createdConversationIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdConversationIds) {
    await deleteConversation(TEST_USER_ID, id).catch(() => {});
  }
});

describe("conversaciones (db)", () => {
  t("crear una solicitud deja mensaje de usuario y ejecución activa", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    expect(created.conversation.title).toBe("un divisor de 12V a 5V");
    expect(created.execution.status).toBe("active");
    expect(created.execution.requestText).toBe("un divisor de 12V a 5V");

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.messages).toHaveLength(1);
    expect(detail!.messages[0]!.role).toBe("user");
    expect(detail!.executionStatus).toBe("active");
    expect(detail!.files).toEqual([]);
  });

  t("un seguimiento añade mensaje y abre una ejecución nueva con el contexto", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    const followUp = await appendUserMessage(TEST_USER_ID, created.conversation.id, "ahora a 3.3V");

    expect(followUp).not.toBeNull();
    expect(followUp!.execution.status).toBe("active");
    expect(followUp!.requestText).toContain("Solicitud original: un divisor de 12V a 5V");
    expect(followUp!.requestText).toContain("Nueva instrucción: ahora a 3.3V");

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.messages).toHaveLength(2);
    // el título no cambia con los seguimientos
    expect(detail!.title).toBe("un divisor de 12V a 5V");
  });

  t("la conversación de otro usuario no se ve ni se puede continuar", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un filtro RC");
    createdConversationIds.push(created.conversation.id);

    expect(await getConversationDetail(OTHER_USER_ID, created.conversation.id)).toBeNull();
    expect(await appendUserMessage(OTHER_USER_ID, created.conversation.id, "cambia algo")).toBeNull();
  });

  t("mover a un proyecto y sacarla de él", async () => {
    const proj = await createProject(TEST_USER_ID, { name: `Mover ${Date.now()}`, description: "" });
    createdProjectIds.push(proj.id);
    const created = await createConversationWithRequest(TEST_USER_ID, "un led con resistencia");
    createdConversationIds.push(created.conversation.id);

    const assigned = await moveConversation(TEST_USER_ID, created.conversation.id, proj.id);
    expect(assigned!.projectId).toBe(proj.id);

    const restored = await moveConversation(TEST_USER_ID, created.conversation.id, null);
    expect(restored!.projectId).toBeNull();
  });

  t("mover a un proyecto ajeno no hace nada", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "otro divisor");
    createdConversationIds.push(created.conversation.id);

    expect(
      await moveConversation(TEST_USER_ID, created.conversation.id, "proyecto-que-no-es-mio"),
    ).toBeNull();
  });

  t("el snapshot lista las no asignadas", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor suelto");
    createdConversationIds.push(created.conversation.id);

    const snapshot = await getSnapshot(TEST_USER_ID);
    expect(snapshot.unassignedConversationIds).toContain(created.conversation.id);
    expect(snapshot.conversations.some((item) => item.id === created.conversation.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/workspace/workspace.services.test.ts`
Expected: FAIL — `createConversationWithRequest` no está exportado.

- [ ] **Step 3: Implementa**

Añade al final de `project/apps/server/src/modules/workspace/workspace.services.ts`, y amplía los imports de `workspace.schemas` y añade el de `workspace.context`:

```ts
import { composeRequestText } from "./workspace.context";
import { deriveTitle, toConversationDetail } from "./workspace.schemas";
```

```ts
const ACTIVE_SUMMARY = "Diseño en progreso";

// El driver neon-http no soporta transacciones interactivas: hacen falta los
// ids devueltos por cada INSERT, así que van secuenciales. Si el proceso muere
// en medio, toConversationDetail sintetiza una ejecución fallida.
export async function createConversationWithRequest(userId: string, text: string) {
  const [conversationRow] = await db
    .insert(conversation)
    .values({ userId, projectId: null, title: deriveTitle(text) })
    .returning();

  const [messageRow] = await db
    .insert(message)
    .values({ conversationId: conversationRow!.id, role: "user", content: text })
    .returning();

  const [executionRow] = await db
    .insert(execution)
    .values({
      conversationId: conversationRow!.id,
      status: "active",
      summary: ACTIVE_SUMMARY,
      requestText: text,
    })
    .returning();

  return {
    conversation: conversationRow!,
    message: messageRow!,
    execution: executionRow!,
    requestText: text,
  };
}

export async function deleteConversation(userId: string, id: string) {
  const [row] = await db
    .delete(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .returning();
  return row ?? null;
}

async function loadConversationParts(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .limit(1);
  if (!row) return null;

  const [messages, artifacts, executions] = await Promise.all([
    db.select().from(message).where(eq(message.conversationId, id)).orderBy(asc(message.createdAt)),
    db.select().from(artifact).where(eq(artifact.conversationId, id)).orderBy(asc(artifact.name)),
    db
      .select()
      .from(execution)
      .where(eq(execution.conversationId, id))
      .orderBy(desc(execution.startedAt))
      .limit(1),
  ]);

  return { row, messages, artifacts, latestExecution: executions.at(0) };
}

export async function getConversationDetail(userId: string, id: string) {
  await sweepStaleExecutions();
  const parts = await loadConversationParts(userId, id);
  if (!parts) return null;
  return toConversationDetail(parts.row, parts.messages, parts.artifacts, parts.latestExecution);
}

// Un seguimiento: mensaje del usuario, ejecución nueva, y el request_text
// compuesto con el contexto de la conversación.
export async function appendUserMessage(userId: string, id: string, text: string) {
  const parts = await loadConversationParts(userId, id);
  if (!parts) return null;

  const requestText = composeRequestText(
    parts.messages.map((item) => ({ role: item.role, content: item.content })),
    parts.latestExecution?.normalizedSpec ?? null,
    text,
  );

  const [messageRow] = await db
    .insert(message)
    .values({ conversationId: id, role: "user", content: text })
    .returning();

  const [executionRow] = await db
    .insert(execution)
    .values({
      conversationId: id,
      status: "active",
      summary: ACTIVE_SUMMARY,
      requestText,
    })
    .returning();

  await db.update(conversation).set({ updatedAt: new Date() }).where(eq(conversation.id, id));

  return { message: messageRow!, execution: executionRow!, requestText };
}

// Cubre assignConversation y restoreConversationProject: ambas mueven la
// conversación a un proyecto o a ninguno. Devuelve null si la conversación o el
// proyecto destino no son de este usuario.
export async function moveConversation(
  userId: string,
  id: string,
  projectId: string | null,
): Promise<ConversationSummaryView | null> {
  if (projectId !== null) {
    const [owned] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.userId, userId)))
      .limit(1);
    if (!owned) return null;
  }

  const [row] = await db
    .update(conversation)
    .set({ projectId, updatedAt: new Date() })
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .returning();
  if (!row) return null;

  const parts = await loadConversationParts(userId, id);
  return toConversationSummary(row, parts?.messages.at(-1), parts?.latestExecution);
}

export async function getSnapshot(userId: string) {
  await sweepStaleExecutions();
  const [projects, conversations] = await Promise.all([
    listProjectViews(userId),
    listConversationSummaries(userId),
  ]);

  return {
    projects,
    conversations,
    unassignedConversationIds: conversations
      .filter((item) => item.projectId === null)
      .map((item) => item.id),
  };
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/workspace/workspace.services.test.ts`
Expected: FAIL — `sweepStaleExecutions` no existe todavía. Es lo siguiente; no lo implementes aquí.

- [ ] **Step 5: Commit tras la Tarea 9**

Esta tarea y la siguiente comparten commit: el código no compila sin `sweepStaleExecutions`. Continúa a la Tarea 9 antes de commitear.

---

### Task 9: El barrido de huérfanas y la escritura del resultado

**Files:**
- Modify: `project/apps/server/src/modules/workspace/workspace.services.ts`
- Modify: `project/apps/server/src/modules/workspace/workspace.services.test.ts`

- [ ] **Step 1: Escribe el test que falla**

Añade a `project/apps/server/src/modules/workspace/workspace.services.test.ts` (y a los imports):

```ts
import { makeDbSink, sweepStaleExecutions } from "./workspace.services";
import type { AgentsRunResult } from "./workspace.runner";

const runResult: AgentsRunResult = {
  verdict: { status: "accepted", reason: "all blocks within tolerance", best_iteration: 0 },
  normalized_spec: { blocks: [{ id: "block-1", type: "voltage_divider" }] },
  netlists: { "block-1": { path: "/tmp/circuit.cir", text: "* divisor\nR1 in out 1k\n" } },
  sim_results: { "block-1": { metrics: { v_out: 5.01 }, sim_error: null } },
  component_values: { "block-1": { r1: 1000, r2: 714 } },
  history: [{ iteration: 0, decision: "accept" }],
  iteration: 0,
};

describe("escritura del resultado (db)", () => {
  t("onResult cierra la ejecución, escribe el mensaje y los artefactos", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    const sink = makeDbSink(created.conversation.id, created.execution.id);
    await sink.onResult(runResult);

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.executionStatus).toBe("completed");
    expect(detail!.execution.summary).toBe("all blocks within tolerance");
    expect(detail!.messages).toHaveLength(2);
    expect(detail!.messages[1]!.role).toBe("assistant");
    expect(detail!.messages[1]!.content).toContain("block-1.v_out = 5.01");
    expect(detail!.files).toHaveLength(1);
    expect(detail!.files[0]!.name).toBe("block-1.cir");
    expect(detail!.files[0]!.content).toContain("R1 in out 1k");
  });

  t("una corrida nueva reemplaza los artefactos, no los duplica", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor de 12V a 5V");
    createdConversationIds.push(created.conversation.id);

    await makeDbSink(created.conversation.id, created.execution.id).onResult(runResult);
    const followUp = await appendUserMessage(TEST_USER_ID, created.conversation.id, "ahora a 3.3V");
    await makeDbSink(created.conversation.id, followUp!.execution.id).onResult(runResult);

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.files).toHaveLength(1);
  });

  t("onFailure marca la ejecución fallida con el resumen dado", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor");
    createdConversationIds.push(created.conversation.id);

    await makeDbSink(created.conversation.id, created.execution.id).onFailure("No pudimos ejecutar el diseño.");

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.executionStatus).toBe("failed");
    expect(detail!.execution.summary).toBe("No pudimos ejecutar el diseño.");
  });

  t("el barrido no toca una ejecución activa recién creada", async () => {
    const created = await createConversationWithRequest(TEST_USER_ID, "un divisor reciente");
    createdConversationIds.push(created.conversation.id);

    await sweepStaleExecutions();

    const detail = await getConversationDetail(TEST_USER_ID, created.conversation.id);
    expect(detail!.executionStatus).toBe("active");
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/workspace/workspace.services.test.ts`
Expected: FAIL — `makeDbSink` no está exportado.

- [ ] **Step 3: Implementa**

Añade al final de `project/apps/server/src/modules/workspace/workspace.services.ts`, y añade `lt` al import de `drizzle-orm` y el de `workspace.runner`:

```ts
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";

import {
  mapVerdictToStatus,
  toArtifactDrafts,
  toAssistantMessage,
  type AgentsRunResult,
  type RunSink,
} from "./workspace.runner";
```

```ts
const STALE_RUN_MS = 10 * 60 * 1000;
const STALE_RUN_SUMMARY = "La ejecución se interrumpió antes de terminar.";

// El server corre con `bun run --hot` y se reinicia en cada guardado, lo que
// deja ejecuciones colgadas en 'active' para siempre. Este barrido las cierra.
// Es global, no por usuario: una lectura de cualquiera limpia las de todos, que
// es lo correcto para una operación de mantenimiento.
export async function sweepStaleExecutions(): Promise<void> {
  await db
    .update(execution)
    .set({ status: "failed", summary: STALE_RUN_SUMMARY, finishedAt: new Date() })
    .where(
      and(
        eq(execution.status, "active"),
        lt(execution.startedAt, new Date(Date.now() - STALE_RUN_MS)),
      ),
    );
}

// El sumidero real: traduce el resultado del grafo a filas. Se mantiene aparte
// de startRun para que el camino de red se pruebe sin base de datos.
export function makeDbSink(conversationId: string, executionId: string): RunSink {
  return {
    async onResult(result: AgentsRunResult) {
      const { status, summary } = mapVerdictToStatus(result.verdict);

      await db.insert(message).values({
        conversationId,
        role: "assistant",
        content: toAssistantMessage(result),
      });

      // Los artefactos se reemplazan: son el netlist vigente, no un histórico.
      await db.delete(artifact).where(eq(artifact.conversationId, conversationId));
      const drafts = toArtifactDrafts(result);
      if (drafts.length > 0) {
        await db
          .insert(artifact)
          .values(drafts.map((draft) => ({ conversationId, ...draft })));
      }

      await db
        .update(execution)
        .set({
          status,
          summary,
          verdict: result.verdict,
          normalizedSpec: result.normalized_spec,
          history: result.history,
          finishedAt: new Date(),
        })
        .where(eq(execution.id, executionId));

      await db
        .update(conversation)
        .set({ updatedAt: new Date() })
        .where(eq(conversation.id, conversationId));
    },

    async onFailure(summary: string) {
      await db
        .update(execution)
        .set({ status: "failed", summary, finishedAt: new Date() })
        .where(eq(execution.id, executionId));

      await db
        .update(conversation)
        .set({ updatedAt: new Date() })
        .where(eq(conversation.id, conversationId));
    },
  };
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/workspace/workspace.services.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verifica que todo el server compila**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.services.ts project/apps/server/src/modules/workspace/workspace.services.test.ts
git commit -m "feat(server): servicios de conversaciones, barrido y escritura del resultado"
```

---

### Task 10: El router

**Files:**
- Create: `project/apps/server/src/modules/workspace/workspace.index.ts`
- Test: `project/apps/server/src/modules/workspace/workspace.routes.test.ts`
- Modify: `project/apps/server/src/app.ts`

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/server/src/modules/workspace/workspace.routes.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import app from "@/app";

// Sin sesión toda ruta del workspace debe cerrarse. El comportamiento con
// sesión se cubre en workspace.services.test.ts, que sí toca la base.
describe("rutas del workspace sin sesión", () => {
  test("GET /api/workspace/snapshot -> 401", async () => {
    expect((await app.request("/api/workspace/snapshot")).status).toBe(401);
  });

  test("GET /api/workspace/projects/:id -> 401", async () => {
    expect((await app.request("/api/workspace/projects/p-1")).status).toBe(401);
  });

  test("POST /api/workspace/projects -> 401", async () => {
    const res = await app.request("/api/workspace/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Filtros" }),
    });
    expect(res.status).toBe(401);
  });

  test("GET /api/workspace/conversations/:id -> 401", async () => {
    expect((await app.request("/api/workspace/conversations/c-1")).status).toBe(401);
  });

  test("POST /api/workspace/conversations -> 401", async () => {
    const res = await app.request("/api/workspace/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "un divisor" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/workspace/conversations/:id/messages -> 401", async () => {
    const res = await app.request("/api/workspace/conversations/c-1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "ahora a 3.3V" }),
    });
    expect(res.status).toBe(401);
  });

  test("PATCH /api/workspace/conversations/:id/project -> 401", async () => {
    const res = await app.request("/api/workspace/conversations/c-1/project", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: null }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun test src/modules/workspace/workspace.routes.test.ts`
Expected: FAIL — las rutas devuelven 404 porque el router no existe.

- [ ] **Step 3: Implementa el router**

Crea `project/apps/server/src/modules/workspace/workspace.index.ts`. **Una sola expresión encadenada**: partirla en sentencias sueltas deja las rutas fuera de `AppType`.

```ts
import { z } from "zod";

import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/session";

import { startRun } from "./workspace.runner";
import {
  createProjectSchema,
  moveConversationSchema,
  submitTextSchema,
} from "./workspace.schemas";
import {
  appendUserMessage,
  createConversationWithRequest,
  createProject,
  getConversationDetail,
  getProjectDetail,
  getSnapshot,
  makeDbSink,
  moveConversation,
} from "./workspace.services";

export const workspaceRouter = createRouter()
  .get("/api/workspace/snapshot", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    return c.json(await getSnapshot(userId));
  })
  .get("/api/workspace/projects/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const detail = await getProjectDetail(userId, c.req.param("id"));
    if (!detail) return c.json({ error: "Not Found" }, 404);
    return c.json(detail);
  })
  .post("/api/workspace/projects", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await createProject(userId, parsed.data);
    return c.json(
      {
        id: row.id,
        name: row.name,
        description: row.description,
        conversationIds: [],
        fileCount: 0,
        updatedAt: row.updatedAt.toISOString(),
      },
      201,
    );
  })
  .get("/api/workspace/conversations/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const detail = await getConversationDetail(userId, c.req.param("id"));
    // 404 y no 403 para una conversación ajena: no se confirma que exista.
    if (!detail) return c.json({ error: "Not Found" }, 404);
    return c.json(detail);
  })
  .post("/api/workspace/conversations", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = submitTextSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }

    const created = await createConversationWithRequest(userId, parsed.data.text);

    // Sin await: la corrida puede tardar decenas de segundos y la respuesta
    // sale ya. El client sondea hasta ver la ejecución cerrada.
    void startRun(
      { userId, requestText: created.requestText },
      makeDbSink(created.conversation.id, created.execution.id),
    );

    const detail = await getConversationDetail(userId, created.conversation.id);
    return c.json(detail!, 201);
  })
  .post("/api/workspace/conversations/:id/messages", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const conversationId = c.req.param("id");
    const parsed = submitTextSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }

    const appended = await appendUserMessage(userId, conversationId, parsed.data.text);
    if (!appended) return c.json({ error: "Not Found" }, 404);

    void startRun(
      { userId, requestText: appended.requestText },
      makeDbSink(conversationId, appended.execution.id),
    );

    const detail = await getConversationDetail(userId, conversationId);
    return c.json(detail!);
  })
  // Una sola ruta para assignConversation y restoreConversationProject: mover
  // la conversación a un proyecto o a ninguno es la misma operación.
  .patch("/api/workspace/conversations/:id/project", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = moveConversationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const summary = await moveConversation(userId, c.req.param("id"), parsed.data.projectId);
    if (!summary) return c.json({ error: "Not Found" }, 404);
    return c.json(summary);
  });
```

- [ ] **Step 4: Encadena el router en la app**

Reemplaza `project/apps/server/src/app.ts` completo:

```ts
import createApp from "@/lib/create-app";
import configureOpenAPI from "@/lib/configure-open-api";
import { authRouter } from "@/modules/auth/auth.index";
import { llmRouter } from "@/modules/llm/llm.index";
import { workspaceRouter } from "@/modules/workspace/workspace.index";

const app = createApp();

configureOpenAPI(app);

app.get("/", (c) => c.text("Hello Hono!"));

const routes = app.route("/", authRouter).route("/", llmRouter).route("/", workspaceRouter);

export type AppType = typeof routes;

export default app;
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `bun test src/modules/workspace/workspace.routes.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Corre toda la suite del server y el typecheck**

Run: `bun test`
Expected: todos los tests previos siguen pasando; los de base de datos aparecen como saltados si no pasas las variables.

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add project/apps/server/src/modules/workspace/workspace.index.ts project/apps/server/src/modules/workspace/workspace.routes.test.ts project/apps/server/src/app.ts
git commit -m "feat(server): rutas del modulo workspace"
```

**Fin de la Fase A.** La API responde completa. Generar termina en `failed` con "No pudimos ejecutar el diseño" porque agents todavía no escucha — eso es lo que arregla la Fase B.

---

# Fase B — agents por HTTP

### Task 11: Dependencias y `/health`

**Files:**
- Modify: `project/apps/agents/pyproject.toml`
- Create: `project/apps/agents/src/agents/api.py`
- Test: `project/apps/agents/tests/test_api.py`

- [ ] **Step 1: Añade las dependencias**

En `project/apps/agents/pyproject.toml`, dentro de `dependencies`, añade en orden alfabético:

```toml
dependencies = [
    "fastapi>=0.121.2",
    "httpx>=0.28.1",
    "langchain>=1.3.12",
    "langchain-anthropic>=1.4.8",
    "langchain-google-genai>=4.2.7",
    "langchain-openai>=1.3.5",
    "langgraph>=1.2.8",
    "pydantic>=2.13.4",
    "pyspice>=1.5",
    "uvicorn>=0.42.0",
]
```

Run: `uv sync`
Expected: instala `fastapi` y `uvicorn`.

- [ ] **Step 2: Escribe el test que falla**

Crea `project/apps/agents/tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from agents.api import app

client = TestClient(app)


def test_health_responde_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_api.py -v`
Expected: FAIL — "ModuleNotFoundError: No module named 'agents.api'".

- [ ] **Step 4: Implementa**

Crea `project/apps/agents/src/agents/api.py`:

```python
"""Entrypoint HTTP de agents.

Superficie mínima a propósito: el server es dueño de la persistencia y del
sondeo, así que aquí no hay threads, checkpoints persistentes ni streaming.
"""

from fastapi import FastAPI

app = FastAPI(title="agents")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 5: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_api.py -v`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add project/apps/agents/pyproject.toml project/apps/agents/uv.lock project/apps/agents/src/agents/api.py project/apps/agents/tests/test_api.py
git commit -m "feat(agents): entrypoint FastAPI con /health"
```

---

### Task 12: `POST /runs` con autenticación

**Files:**
- Modify: `project/apps/agents/src/agents/api.py`
- Modify: `project/apps/agents/tests/test_api.py`
- Modify: `project/apps/agents/.env.example`

- [ ] **Step 1: Escribe el test que falla**

Añade a `project/apps/agents/tests/test_api.py`:

```python
import os

import pytest

TOKEN = "token-de-prueba-suficientemente-largo"


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setenv("AGENTS_API_TOKEN", TOKEN)


def test_runs_sin_authorization_es_401():
    response = client.post("/runs", json={"user_id": "user-1", "circuit_spec": {}})
    assert response.status_code == 401


def test_runs_con_token_incorrecto_es_401():
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": {}},
        headers={"Authorization": "Bearer token-equivocado"},
    )
    assert response.status_code == 401


def test_runs_sin_user_id_es_422():
    response = client.post(
        "/runs",
        json={"circuit_spec": {}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 422


def test_runs_sin_texto_ni_spec_es_400():
    response = client.post(
        "/runs",
        json={"user_id": "user-1"},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 400


def test_runs_sin_token_configurado_en_el_entorno_es_503(monkeypatch):
    monkeypatch.delenv("AGENTS_API_TOKEN", raising=False)
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": {}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert response.status_code == 503
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_api.py -v`
Expected: FAIL — `/runs` devuelve 405 porque la ruta no existe.

- [ ] **Step 3: Implementa**

Reemplaza `project/apps/agents/src/agents/api.py` completo:

```python
"""Entrypoint HTTP de agents.

Superficie mínima a propósito: el server es dueño de la persistencia y del
sondeo, así que aquí no hay threads, checkpoints persistentes ni streaming.
"""

import os
import secrets
import uuid

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="agents")


class RunRequest(BaseModel):
    user_id: str
    request_text: str | None = None
    circuit_spec: dict | None = None


def _require_token(authorization: str | None) -> None:
    expected = os.environ.get("AGENTS_API_TOKEN")
    if not expected:
        # Sin token configurado no se sirve: aceptar sin autenticar sería peor.
        raise HTTPException(status_code=503, detail="AGENTS_API_TOKEN is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    provided = authorization[len("Bearer ") :]
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/runs")
def create_run(body: RunRequest, authorization: str | None = Header(default=None)) -> dict:
    _require_token(authorization)

    if body.request_text is None and body.circuit_spec is None:
        raise HTTPException(status_code=400, detail="request_text or circuit_spec is required")

    return {"verdict": None}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_api.py -v`
Expected: PASS, 6 tests.

- [ ] **Step 5: Documenta la variable**

Añade a `project/apps/agents/.env.example`:

```
# Token con el que el server llama a POST /runs de este servicio. Debe ser el
# mismo valor que AGENTS_API_TOKEN en apps/server/.env. Distinto de
# AGENTS_SERVICE_TOKEN: ese va en la dirección contraria.
# Genéralo con: openssl rand -hex 32
AGENTS_API_TOKEN=
```

- [ ] **Step 6: Commit**

```bash
git add project/apps/agents/src/agents/api.py project/apps/agents/tests/test_api.py project/apps/agents/.env.example
git commit -m "feat(agents): POST /runs con autenticacion por token"
```

---

### Task 13: `POST /runs` invoca el grafo

**Files:**
- Modify: `project/apps/agents/src/agents/api.py`
- Modify: `project/apps/agents/tests/test_api.py`
- Create: `project/apps/agents/langgraph.json`

- [ ] **Step 1: Escribe el test que falla**

Añade a `project/apps/agents/tests/test_api.py`. Este test ejercita el `ngspice` real de punta a punta por la vía del `circuit_spec` estructurado, que no necesita LLM:

```python
VOLTAGE_DIVIDER_SPEC = {
    "blocks": [
        {
            "id": "block-1",
            "type": "voltage_divider",
            "params": {"v_in": 12.0, "v_out": 5.0, "i_load": 0.001},
            "goal": {"metric": "v_out", "target": 5.0, "tolerance": 0.05},
        }
    ],
    "max_iterations": 5,
}


def test_runs_con_circuit_spec_devuelve_veredicto_y_netlist():
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": VOLTAGE_DIVIDER_SPEC},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    assert response.status_code == 200
    body = response.json()

    assert body["verdict"]["status"] == "accepted"
    assert "block-1" in body["netlists"]
    assert "R1" in body["netlists"]["block-1"]["text"]
    assert body["sim_results"]["block-1"]["sim_error"] is None
    assert body["history"]


def test_runs_con_spec_invalido_devuelve_200_con_veredicto_rechazado():
    response = client.post(
        "/runs",
        json={"user_id": "user-1", "circuit_spec": {"blocks": [], "max_iterations": 5}},
        headers={"Authorization": f"Bearer {TOKEN}"},
    )

    # El grafo siempre termina con veredicto en lugar de lanzar: un spec
    # inválido es un resultado, no un error HTTP.
    assert response.status_code == 200
    assert response.json()["verdict"]["status"] == "rejected"
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `uv run pytest tests/test_api.py -v`
Expected: FAIL — `body["verdict"]` es `None`; el handler todavía no invoca el grafo.

- [ ] **Step 3: Implementa**

En `project/apps/agents/src/agents/api.py`, añade el import del grafo y del estado, y reemplaza el cuerpo de `create_run`:

```python
from agents.graph import build_graph
```

```python
@app.post("/runs")
def create_run(body: RunRequest, authorization: str | None = Header(default=None)) -> dict:
    _require_token(authorization)

    if body.request_text is None and body.circuit_spec is None:
        raise HTTPException(status_code=400, detail="request_text or circuit_spec is required")

    graph = build_graph()

    initial_state = {
        "circuit_spec": body.circuit_spec or {},
        "request_text": body.request_text,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    # user_id viaja en el config, no en el estado: es identidad de la corrida,
    # no un dato del circuito. thread_id lo exige el MemorySaver.
    final_state = graph.invoke(
        initial_state,
        config={"configurable": {"user_id": body.user_id, "thread_id": str(uuid.uuid4())}},
    )

    return {
        "verdict": final_state["verdict"],
        "normalized_spec": final_state["normalized_spec"],
        "netlists": final_state["netlists"],
        "sim_results": final_state["sim_results"],
        "component_values": final_state["component_values"],
        "history": final_state["history"],
        "iteration": final_state["iteration"],
    }
```

El handler se declara con `def` y no `async def` a propósito: el grafo es síncrono y FastAPI lo ejecuta en su threadpool, sin bloquear el event loop.

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `uv run pytest tests/test_api.py -v`
Expected: PASS, 8 tests. Requiere `ngspice` en el `PATH`.

- [ ] **Step 5: Añade el config de LangGraph Studio**

Crea `project/apps/agents/langgraph.json`. Es solo herramienta de desarrollo: el server no lo usa.

```json
{
  "dependencies": ["."],
  "graphs": {
    "circuit": "./src/agents/graph.py:build_graph"
  },
  "env": ".env"
}
```

- [ ] **Step 6: Corre toda la suite de agents**

Run: `uv run pytest`
Expected: los 78 tests previos siguen pasando, más los 8 nuevos. Los `live_llm` aparecen saltados sin sus variables.

- [ ] **Step 7: Commit**

```bash
git add project/apps/agents/src/agents/api.py project/apps/agents/tests/test_api.py project/apps/agents/langgraph.json
git commit -m "feat(agents): POST /runs invoca el grafo"
```

- [ ] **Step 8: PARADA — verificación manual de las dos apps juntas**

Levanta agents y comprueba el puente antes de tocar el client:

```bash
cd project/apps/agents && uv run --env-file .env uvicorn agents.api:app --port 8000
```

Con el server corriendo en 3001 y una sesión válida, un `POST /api/workspace/conversations` debe devolver la conversación en `active` y, unos segundos después, un `GET /api/workspace/conversations/:id` debe traer el netlist. Si falla, revisa que `AGENTS_API_TOKEN` sea idéntico en los dos `.env`.

**Fin de la Fase B.**

---

# Fase C — El client

Una aclaración sobre el manejo de errores de lectura en el client: **no hace falta trabajo nuevo.** Las pantallas del workspace ya tienen su estado `loadError` con mensaje seguro (`ConversationScreen.tsx:55` y equivalentes), y el `refresh` del sondeo traga los fallos puntuales de red porque el ciclo siguiente reintenta. Lo que el spec pide ya existe; ninguna tarea de esta fase lo toca.

### Task 14: Paridad del mock

**Files:**
- Modify: `project/apps/client/src/features/workspace/services/mock-workspace-service.ts`
- Modify: `project/apps/client/src/features/workspace/services/mock-workspace-service.test.ts`

Hoy el mock deja la ejecución en `active` para siempre. Con sondeo eso gira sin fin, así que el mock tiene que simular que la corrida termina.

- [ ] **Step 1: Escribe el test que falla**

Añade a `project/apps/client/src/features/workspace/services/mock-workspace-service.test.ts`:

```ts
it('completa la ejecución de una solicitud nueva en la siguiente lectura', async () => {
  const service = createMockWorkspaceService()

  const created = await service.submitRequest('un divisor de 12V a 5V')
  expect(created.executionStatus).toBe('active')

  const polled = await service.getConversation(created.id)
  expect(polled.executionStatus).toBe('completed')
  expect(polled.execution.status).toBe('completed')
  expect(polled.files).toHaveLength(1)
  expect(polled.files[0].language).toBe('spice')
  expect(polled.messages.at(-1)?.role).toBe('assistant')
})

it('no reabre ni vuelve a completar una conversación ya completada', async () => {
  const service = createMockWorkspaceService()

  const created = await service.submitRequest('un divisor de 12V a 5V')
  const first = await service.getConversation(created.id)
  const second = await service.getConversation(created.id)

  expect(second.executionStatus).toBe('completed')
  expect(second.messages).toHaveLength(first.messages.length)
  expect(second.files).toHaveLength(1)
})

it('no toca las conversaciones de fixture que ya vienen activas', async () => {
  const service = createMockWorkspaceService()
  const snapshot = await service.getSnapshot()
  const active = snapshot.conversations.find((item) => item.executionStatus === 'active')

  if (active) {
    const detail = await service.getConversation(active.id)
    expect(detail.executionStatus).toBe('active')
  }
})
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun run test -- mock-workspace-service`
Expected: FAIL — la conversación sigue `active` tras la segunda lectura.

- [ ] **Step 3: Implementa**

En `project/apps/client/src/features/workspace/services/mock-workspace-service.ts`, dentro de `createMockWorkspaceService`, añade junto a los contadores:

```ts
  // Solo las conversaciones creadas en esta sesión completan: las de fixture
  // conservan el estado que declaran, para no alterar los tests existentes.
  const awaitingCompletion = new Set<string>()
```

Reemplaza `getConversation` y `submitRequest`:

```ts
    async getConversation(conversationId) {
      const conversation = getConversationRecord(conversationId)
      if (awaitingCompletion.has(conversationId)) {
        awaitingCompletion.delete(conversationId)
        conversation.executionStatus = 'completed'
        conversation.execution = {
          ...conversation.execution,
          status: 'completed',
          summary: 'all blocks within tolerance',
        }
        conversation.files = [
          {
            id: `${conversationId}-file-1`,
            name: 'block-1.cir',
            language: 'spice',
            content: '* divisor\nR1 in out 1k\nR2 out 0 714\n',
            status: 'complete',
          },
        ]
        conversation.messages.push({
          id: `${conversationId}-message-${conversation.messages.length + 1}`,
          role: 'assistant',
          content: 'all blocks within tolerance\n\nblock-1.v_out = 5.01\nIteraciones: 1',
          createdAt: '2026-07-15T12:00:30.000Z',
        })
      }
      return clone(conversation)
    },
```

```ts
    async submitRequest(text) {
      const id = `conversation-created-${conversationSequence++}`
      const created: WorkspaceConversationDetail = {
        id,
        projectId: null,
        title: text,
        preview: text,
        updatedAt: '2026-07-15T12:00:00.000Z',
        executionStatus: 'active',
        messages: [
          { id: `${id}-message-1`, role: 'user', content: text, createdAt: '2026-07-15T12:00:00.000Z' },
        ],
        files: [],
        execution: { id: `${id}-execution`, status: 'active', summary: 'Diseño en progreso' },
      }
      conversations.push(created)
      awaitingCompletion.add(id)
      return clone(created)
    },
```

Nota: se quita el mensaje del asistente "Estoy preparando el circuito." que el mock insertaba al crear. El server real no lo escribe —el asistente solo habla cuando hay resultado— y dejarlo rompería la paridad.

- [ ] **Step 4: Corre los tests del client y verifica que pasan**

Run: `bun run test`
Expected: PASS. Si `NewRequestScreen.test.tsx` o `ConversationScreen.test.tsx` fallan por el mensaje del asistente que se quitó, actualiza esas aserciones: el mock ahora refleja el comportamiento real.

- [ ] **Step 5: Commit**

```bash
git add project/apps/client/src/features/workspace/services/mock-workspace-service.ts project/apps/client/src/features/workspace/services/mock-workspace-service.test.ts
git commit -m "test(client): el mock del workspace completa la ejecucion"
```

---

### Task 15: `HttpWorkspaceService`

**Files:**
- Create: `project/apps/client/src/features/workspace/services/http-workspace-service.ts`
- Test: `project/apps/client/src/features/workspace/services/http-workspace-service.test.ts`

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/client/src/features/workspace/services/http-workspace-service.test.ts`:

```ts
import { expect, it, vi } from 'vitest'

import { createHttpWorkspaceService } from './http-workspace-service'

const conversationDetail = {
  id: 'conv-1',
  projectId: null,
  title: 'un divisor de 12V a 5V',
  preview: 'all blocks within tolerance',
  updatedAt: '2026-07-29T12:00:05.000Z',
  executionStatus: 'completed',
  messages: [],
  files: [],
  execution: { id: 'exec-1', status: 'completed', summary: 'all blocks within tolerance' },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

it('lee el snapshot enviando las cookies de sesión', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    jsonResponse({ projects: [], conversations: [], unassignedConversationIds: [] }),
  )
  const service = createHttpWorkspaceService({ fetchImpl })

  const snapshot = await service.getSnapshot()

  expect(snapshot.projects).toEqual([])
  expect(fetchImpl).toHaveBeenCalledWith(
    '/api/workspace/snapshot',
    expect.objectContaining({ credentials: 'include' }),
  )
})

it('crea un proyecto con POST y el cuerpo en JSON', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(
    jsonResponse({
      id: 'p-1',
      name: 'Filtros',
      description: 'analógicos',
      conversationIds: [],
      fileCount: 0,
      updatedAt: '2026-07-29T12:00:00.000Z',
    }, 201),
  )
  const service = createHttpWorkspaceService({ fetchImpl })

  const project = await service.createProject({ name: 'Filtros', description: 'analógicos' })

  expect(project.id).toBe('p-1')
  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('/api/workspace/projects')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body)).toEqual({ name: 'Filtros', description: 'analógicos' })
})

it('envía una solicitud nueva al endpoint de conversaciones', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(conversationDetail, 201))
  const service = createHttpWorkspaceService({ fetchImpl })

  await service.submitRequest('un divisor de 12V a 5V')

  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('/api/workspace/conversations')
  expect(JSON.parse(init.body)).toEqual({ text: 'un divisor de 12V a 5V' })
})

it('continúa una conversación por su subruta de mensajes', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(conversationDetail))
  const service = createHttpWorkspaceService({ fetchImpl })

  await service.continueConversation('conv-1', 'ahora a 3.3V')

  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('/api/workspace/conversations/conv-1/messages')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body)).toEqual({ text: 'ahora a 3.3V' })
})

it('asignar y restaurar usan la misma ruta PATCH', async () => {
  const summary = {
    id: 'conv-1',
    projectId: 'p-1',
    title: 't',
    preview: 'p',
    updatedAt: '2026-07-29T12:00:05.000Z',
    executionStatus: 'completed',
  }
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(summary))
  const service = createHttpWorkspaceService({ fetchImpl })

  await service.assignConversation('conv-1', 'p-1')
  await service.restoreConversationProject('conv-1', null)

  expect(fetchImpl.mock.calls[0][0]).toBe('/api/workspace/conversations/conv-1/project')
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ projectId: 'p-1' })
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/workspace/conversations/conv-1/project')
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ projectId: null })
})

it('un error del server se convierte en excepción con el código', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'Not Found' }, 404))
  const service = createHttpWorkspaceService({ fetchImpl })

  await expect(service.getConversation('conv-ausente')).rejects.toThrow('404')
})
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun run test -- http-workspace-service`
Expected: FAIL — no se resuelve `./http-workspace-service`.

- [ ] **Step 3: Implementa**

Crea `project/apps/client/src/features/workspace/services/http-workspace-service.ts`. Mismo patrón que `http-settings-service.ts`: `fetch` con rutas en texto, no el cliente RPC.

```ts
import type {
  ProjectInput,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceProject,
  WorkspaceProjectDetail,
  WorkspaceSnapshot,
} from '../model/workspace-types'
import type { WorkspaceService } from './workspace-service'

type Options = { fetchImpl?: typeof fetch }

export function createHttpWorkspaceService(options: Options = {}): WorkspaceService {
  const fetchImpl = options.fetchImpl ?? fetch

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchImpl(path, {
      credentials: 'include',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      ...init,
    })
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path} respondió ${response.status}`)
    }
    return (await response.json()) as T
  }

  // assignConversation y restoreConversationProject son la misma operación:
  // mover la conversación a un proyecto o a ninguno.
  function move(conversationId: string, projectId: string | null) {
    return request<WorkspaceConversation>(
      `/api/workspace/conversations/${conversationId}/project`,
      { method: 'PATCH', body: JSON.stringify({ projectId }) },
    )
  }

  return {
    async getSnapshot(): Promise<WorkspaceSnapshot> {
      return request<WorkspaceSnapshot>('/api/workspace/snapshot')
    },

    async getProject(projectId): Promise<WorkspaceProjectDetail> {
      return request<WorkspaceProjectDetail>(`/api/workspace/projects/${projectId}`)
    },

    async getConversation(conversationId): Promise<WorkspaceConversationDetail> {
      return request<WorkspaceConversationDetail>(
        `/api/workspace/conversations/${conversationId}`,
      )
    },

    async createProject(input: ProjectInput): Promise<WorkspaceProject> {
      return request<WorkspaceProject>('/api/workspace/projects', {
        method: 'POST',
        body: JSON.stringify({ name: input.name.trim(), description: input.description.trim() }),
      })
    },

    async submitRequest(text): Promise<WorkspaceConversationDetail> {
      return request<WorkspaceConversationDetail>('/api/workspace/conversations', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      })
    },

    async continueConversation(conversationId, text): Promise<WorkspaceConversationDetail> {
      return request<WorkspaceConversationDetail>(
        `/api/workspace/conversations/${conversationId}/messages`,
        { method: 'POST', body: JSON.stringify({ text: text.trim() }) },
      )
    },

    async assignConversation(conversationId, projectId): Promise<WorkspaceConversation> {
      return move(conversationId, projectId)
    },

    async restoreConversationProject(conversationId, projectId): Promise<WorkspaceConversation> {
      return move(conversationId, projectId)
    },
  }
}

export const httpWorkspaceService = createHttpWorkspaceService()
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `bun run test -- http-workspace-service`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/client/src/features/workspace/services/http-workspace-service.ts project/apps/client/src/features/workspace/services/http-workspace-service.test.ts
git commit -m "feat(client): HttpWorkspaceService contra el server real"
```

---

### Task 16: El hook de sondeo

**Files:**
- Create: `project/apps/client/src/features/workspace/model/use-conversation-polling.ts`
- Test: `project/apps/client/src/features/workspace/model/use-conversation-polling.test.ts`

- [ ] **Step 1: Escribe el test que falla**

Crea `project/apps/client/src/features/workspace/model/use-conversation-polling.test.ts`:

```ts
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { POLL_INTERVAL_MS, useConversationPolling } from './use-conversation-polling'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('resondea mientras la ejecución esté activa', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  renderHook(() => useConversationPolling('active', refresh))

  expect(refresh).not.toHaveBeenCalled()
  vi.advanceTimersByTime(POLL_INTERVAL_MS)
  expect(refresh).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(POLL_INTERVAL_MS * 2)
  expect(refresh).toHaveBeenCalledTimes(3)
})

it('no sondea si la ejecución ya terminó', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  renderHook(() => useConversationPolling('completed', refresh))

  vi.advanceTimersByTime(POLL_INTERVAL_MS * 5)
  expect(refresh).not.toHaveBeenCalled()
})

it('no sondea antes de que la conversación cargue', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  renderHook(() => useConversationPolling(null, refresh))

  vi.advanceTimersByTime(POLL_INTERVAL_MS * 5)
  expect(refresh).not.toHaveBeenCalled()
})

it('para de sondear cuando el estado pasa a completado', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  const { rerender } = renderHook(
    ({ status }: { status: 'active' | 'completed' }) =>
      useConversationPolling(status, refresh),
    { initialProps: { status: 'active' as const } },
  )

  vi.advanceTimersByTime(POLL_INTERVAL_MS)
  expect(refresh).toHaveBeenCalledTimes(1)

  rerender({ status: 'completed' })
  vi.advanceTimersByTime(POLL_INTERVAL_MS * 3)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('deja de sondear al desmontar', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  const { unmount } = renderHook(() => useConversationPolling('active', refresh))

  unmount()
  vi.advanceTimersByTime(POLL_INTERVAL_MS * 5)
  expect(refresh).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun run test -- use-conversation-polling`
Expected: FAIL — no se resuelve `./use-conversation-polling`.

- [ ] **Step 3: Implementa**

Crea `project/apps/client/src/features/workspace/model/use-conversation-polling.ts`:

```ts
import { useEffect } from 'react'

import type { WorkspaceExecutionStatus } from './workspace-types'

export const POLL_INTERVAL_MS = 2000

// Sondear es volver a leer la conversación: el WorkspaceService no necesita un
// método extra. `refresh` debe tener identidad estable (useCallback) o el
// efecto reinicia el intervalo en cada render y no llega a disparar.
export function useConversationPolling(
  executionStatus: WorkspaceExecutionStatus | null,
  refresh: () => Promise<void>,
  intervalMs: number = POLL_INTERVAL_MS,
): void {
  const isRunning = executionStatus === 'active'

  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => {
      void refresh()
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, isRunning, refresh])
}
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `bun run test -- use-conversation-polling`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/client/src/features/workspace/model/use-conversation-polling.ts project/apps/client/src/features/workspace/model/use-conversation-polling.test.ts
git commit -m "feat(client): hook de sondeo de la conversacion"
```

---

### Task 17: `ConversationScreen` sondea

**Files:**
- Modify: `project/apps/client/src/features/workspace/components/ConversationScreen.tsx`
- Modify: `project/apps/client/src/features/workspace/components/ConversationScreen.test.tsx`

- [ ] **Step 1: Escribe el test que falla**

Añade a `project/apps/client/src/features/workspace/components/ConversationScreen.test.tsx`:

```ts
it('refresca la conversación hasta que la ejecución termina', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const service = createMockWorkspaceService()
  const detail = await service.getConversation('conversation-rc')

  const getConversation = vi
    .spyOn(service, 'getConversation')
    .mockResolvedValueOnce({ ...detail, executionStatus: 'active', execution: { ...detail.execution, status: 'active' } })
    .mockResolvedValue({ ...detail, executionStatus: 'completed', execution: { ...detail.execution, status: 'completed' } })

  renderScreen(service)

  expect(await screen.findByText('En curso')).toBeVisible()

  await vi.advanceTimersByTimeAsync(2000)
  expect(await screen.findByText('Completada')).toBeVisible()

  const callsAfterCompletion = getConversation.mock.calls.length
  await vi.advanceTimersByTimeAsync(6000)
  expect(getConversation.mock.calls.length).toBe(callsAfterCompletion)

  vi.useRealTimers()
})
```

`renderScreen(service, id = 'conversation-rc')` ya está definido al principio de ese archivo (monta la pantalla dentro de un `MemoryRouter`); reúsalo tal cual, sin redefinirlo.

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `bun run test -- ConversationScreen`
Expected: FAIL — sigue mostrando "En curso"; la pantalla no resondea.

- [ ] **Step 3: Implementa**

En `project/apps/client/src/features/workspace/components/ConversationScreen.tsx`:

Añade `useCallback` al import de React y el import del hook:

```ts
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
```

```ts
import { useConversationPolling } from '../model/use-conversation-polling'
```

Añade, justo después del `useEffect` de carga inicial:

```ts
  // useCallback es obligatorio: sin identidad estable, el efecto del hook
  // reinicia el intervalo en cada render y el sondeo nunca dispara.
  const refresh = useCallback(async () => {
    try {
      setConversation(await service.getConversation(conversationId))
    } catch {
      // Un fallo puntual de red no debe tumbar la pantalla ya cargada: el
      // siguiente ciclo del sondeo lo reintenta.
    }
  }, [conversationId, service])

  useConversationPolling(conversation?.executionStatus ?? null, refresh)
```

- [ ] **Step 4: Corre el test y verifica que pasa**

Run: `bun run test -- ConversationScreen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add project/apps/client/src/features/workspace/components/ConversationScreen.tsx project/apps/client/src/features/workspace/components/ConversationScreen.test.tsx
git commit -m "feat(client): la pantalla de conversacion sondea la ejecucion"
```

---

### Task 18: Inyectar el servicio real

**Files:**
- Modify: `project/apps/client/src/App.tsx`
- Modify: `project/apps/client/src/App.test.tsx`

- [ ] **Step 1: Cambia la inyección**

En `project/apps/client/src/App.tsx`, sustituye el import del mock:

```ts
import { httpWorkspaceService } from './features/workspace/services/http-workspace-service'
```

y la línea 20:

```ts
const workspaceService = httpWorkspaceService
```

Elimina el import de `createMockWorkspaceService`, que queda sin uso: `bun run lint` falla con un import muerto.

- [ ] **Step 2: Adapta el test de rutas**

`App.test.tsx` recorre rutas del workspace y espera encabezados. Con el servicio real, esas pantallas hacen `fetch` y sin stub se quedan cargando para siempre. Añade el stub de `fetch` en el `beforeEach` de `project/apps/client/src/App.test.tsx`:

```ts
const workspaceSnapshot = {
  projects: [
    {
      id: 'project-filters',
      name: 'Filtros analógicos',
      description: 'pruebas',
      conversationIds: ['conversation-filter'],
      fileCount: 1,
      updatedAt: '2026-07-29T12:00:00.000Z',
    },
  ],
  conversations: [
    {
      id: 'conversation-filter',
      projectId: 'project-filters',
      title: 'Detalle de la conversación',
      preview: 'listo',
      updatedAt: '2026-07-29T12:00:05.000Z',
      executionStatus: 'completed',
    },
  ],
  unassignedConversationIds: [],
}

const conversationDetail = {
  ...workspaceSnapshot.conversations[0],
  messages: [],
  files: [],
  execution: { id: 'exec-1', status: 'completed', summary: 'all blocks within tolerance' },
}

function stubWorkspaceFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input)
      const body = url.includes('/snapshot')
        ? workspaceSnapshot
        : url.includes('/projects/')
          ? { ...workspaceSnapshot.projects[0], conversations: workspaceSnapshot.conversations }
          : conversationDetail
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}
```

Llama a `stubWorkspaceFetch()` dentro del `beforeEach` existente, y añade `vi.unstubAllGlobals()` al `afterEach`.

Nota: el caso `/conversations/conversation-filter` ya fallaba antes de este trabajo (verificado con `git stash`). Si sigue fallando por el mismo motivo, no es una regresión; si falla por otro, sí lo es — compara el mensaje.

- [ ] **Step 3: Corre la suite completa del client**

Run: `bun run test`
Expected: PASS salvo el fallo preexistente de `/conversations/conversation-filter`, si persiste.

- [ ] **Step 4: Lint y build**

Run: `bun run lint`
Expected: sin errores. Un import del mock sin usar es error, no aviso.

Run: `bun run build`
Expected: build limpio. El `prebuild` regenera los tipos del server.

- [ ] **Step 5: Commit**

```bash
git add project/apps/client/src/App.tsx project/apps/client/src/App.test.tsx
git commit -m "feat(client): inyectar el WorkspaceService real"
```

**Fin de la Fase C.** Recorre el criterio de terminado del spec, punto por punto, con las tres apps levantadas.

---

# Fase D — Documentación

### Task 19: Actualizar la documentación desfasada

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `project/apps/agents/README.md`

- [ ] **Step 1: `CLAUDE.md`**

Cuatro cambios concretos:

1. En "Server architecture", `src/app.ts` dice que encadena "currently `authRouter` and `llmRouter`". Añade `workspaceRouter`.
2. En "Existing modules:", que dice "`auth` and `llm`", añade `workspace` con un párrafo: cinco tablas (`project`, `conversation`, `message`, `execution`, `artifact`); los artefactos cuelgan de la conversación y se reemplazan en cada corrida; nada derivado se almacena; el driver `neon-http` no soporta transacciones interactivas, así que crear una conversación son tres INSERT y `toConversationDetail` sintetiza una ejecución fallida si falta; el barrido cierra ejecuciones `active` de más de diez minutos porque `--hot` reinicia el server.
3. En `src/lib/env.ts`, añade `AGENTS_BASE_URL` y `AGENTS_API_TOKEN` a la lista de variables, señalando que este último es la dirección contraria de `AGENTS_SERVICE_TOKEN`.
4. En la sección de agents, corrige "nothing invokes the graph over HTTP yet — agents is still a library, with no HTTP entrypoint": ya hay `src/agents/api.py` con `POST /runs` y `GET /health`, autenticado con `AGENTS_API_TOKEN`, y se levanta con `uv run uvicorn agents.api:app --port 8000`. Menciona `langgraph.json` como herramienta de desarrollo y por qué no se usa el servidor de LangGraph (Elastic License 2.0).

En la sección del client, actualiza "`settings` is wired to the real server …; `workspace` and `home` still run on mocks": ahora `workspace` también está conectado, y solo `home` sigue en mock.

- [ ] **Step 2: `AGENTS.md`**

Solo dos cosas, que es un puntero a `CLAUDE.md`: añade `uv run uvicorn agents.api:app --port 8000` al bloque de comandos de agents, y añade a "Conventions that are easy to violate" que el driver `neon-http` no soporta transacciones interactivas.

- [ ] **Step 3: `README.md`**

En el paso 3 (Agents), añade que además del pull de configuración, agents ahora **escucha**: hay que levantar `uvicorn` para que la generación funcione, y `AGENTS_API_TOKEN` debe coincidir con el del server. Añade el comando al bloque de comandos de agents.

- [ ] **Step 4: `project/apps/agents/README.md`**

Añade una sección "HTTP entrypoint" con las dos rutas, el token, el comando de uvicorn, y la nota de `langgraph.json` / Elastic License 2.0.

- [ ] **Step 5: Verifica que no queda nada desfasado**

Run: `grep -rn "still a library\|no HTTP entrypoint\|workspace.*mock" CLAUDE.md AGENTS.md README.md project/apps/agents/README.md`
Expected: sin resultados.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md AGENTS.md README.md project/apps/agents/README.md
git commit -m "docs: documentar el modulo workspace y el entrypoint de agents"
```

---

## Verificación final

- [ ] Server: `bun test` verde, y `RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test` sin saltados.
- [ ] Server: `bun run typecheck` limpio.
- [ ] Agents: `uv run pytest` verde con `ngspice` en el `PATH`.
- [ ] Client: `bun run test`, `bun run lint` y `bun run build` limpios.
- [ ] Los siete puntos del criterio de terminado del spec, a mano, con las tres apps levantadas.
