# Llaves LLM de punta a punta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un usuario autenticado configure sus credenciales de LLM en la interfaz, queden cifradas en el server, y el orquestador de agents las consuma para generar.

**Architecture:** `llm_config` se parte en `llm_connection` (credencial) + `agent_llm_assignment` (agente → conexión + modelo). El client implementa `SettingsService` sobre el cliente RPC tipado que ya existe. Agents pide al server la configuración del agente que le toca, con `userId` en la petición y cache por `(agent_id, user_id)`.

**Tech Stack:** Bun + Hono (`OpenAPIHono`) + Drizzle/Neon en el server; React + Vite + Vitest + `hono/client` en el client; Python 3.12 + LangGraph + httpx + pytest en agents.

**Spec:** [`../specs/2026-07-29-llaves-llm-end-to-end-design.md`](../specs/2026-07-29-llaves-llm-end-to-end-design.md)

---

## Contexto que el implementador necesita

**Tres apps independientes, sin workspace raíz.** Cada comando se corre desde su carpeta:
`project/apps/server` (Bun), `project/apps/client` (npm), `project/apps/agents` (uv).

**Dos gotchas que van a costar tiempo si no se saben de antemano:**

1. **El client consume los tipos del server.** `client/src/lib/rpc.ts` hace `hc<AppType>` con `import type { AppType } from 'server'`, y esos tipos se generan con `bun run --cwd ../server build:types`. **Después de tocar rutas del server hay que regenerarlos** o el client seguirá viendo la API vieja. El plan lo marca donde toca.
2. **Las rutas deben ir encadenadas.** `AppType` solo carga la información de una ruta si el router se construye como una sola expresión encadenada, como hace `auth.index.ts`. El `llmRouter` actual usa sentencias sueltas (`llmRouter.get(...)`), y por eso hoy no está tipado en el client. La Task 7 lo reescribe encadenado.

**Los tests que tocan la base de datos están gateados.** Corren solo con `RUN_DB_TESTS=1` y necesitan un `TEST_USER_ID` que exista de verdad en la tabla `user`:

```bash
cd project/apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test
```

Sin esas variables se saltan, y "saltado" no es "pasado". Las tareas 3, 4 y 5 lo exigen explícitamente.

**Migraciones:** este plan **nunca** ejecuta `db:generate`, `db:migrate` ni `db:push`. Escribe el schema y se detiene a pedirlas. La Task 1 es un punto de bloqueo real.

---

## Estructura de archivos

### Server (`project/apps/server`)

| Archivo | Responsabilidad |
|---|---|
| `src/modules/llm/llm.model.ts` | *(modificar)* Las dos tablas y los enums `LLM_PROVIDERS`, `AGENT_IDS`, `TEST_STATUSES`. Sin lógica. |
| `src/modules/llm/llm.schemas.ts` | *(modificar)* Validación Zod de entradas y la vista pública que jamás incluye la key. |
| `src/modules/llm/llm.services.ts` | *(modificar)* Acceso a datos: CRUD de conexiones, upsert de asignaciones, resolución por agente. Única puerta al descifrado. |
| `src/modules/llm/llm.providers.ts` | *(crear)* Sonda HTTP a cada proveedor. Sin base de datos, sin Hono: entra una credencial, sale `{ok}`. |
| `src/modules/llm/llm.index.ts` | *(modificar)* Router encadenado. Solo traduce HTTP ↔ servicios. |

Cuatro archivos con una responsabilidad cada uno. `llm.providers.ts` nace separado porque es la única pieza que habla con Internet, y aislarla es lo que permite probarla sin red.

### Client (`project/apps/client`)

| Archivo | Responsabilidad |
|---|---|
| `src/features/settings/model/settings-types.ts` | *(modificar)* `LlmConnection` gana estado de prueba; `SettingsService` gana `testConnection`. |
| `src/features/settings/model/settings-fixtures.ts` | *(modificar)* Fixtures al día con los tipos nuevos. |
| `src/features/settings/services/settings-service.ts` | *(modificar)* La interfaz. |
| `src/features/settings/services/http-settings-service.ts` | *(crear)* Implementación real sobre `rpc`. |
| `src/features/settings/services/mock-settings-service.ts` | *(modificar)* Mantiene paridad con la interfaz; lo usan los tests de componentes. |
| `src/features/settings/components/ModelSettingsScreen.tsx` | *(modificar)* Badge de tres estados + botón "Probar". |
| `src/App.tsx` | *(modificar)* Inyecta el servicio real. |

### Agents (`project/apps/agents`)

| Archivo | Responsabilidad |
|---|---|
| `src/agents/llm/settings_client.py` | *(modificar)* `fetch_agent_llm(agent_id, user_id)` + cache por par. |
| `src/agents/llm/factory.py` | *(modificar)* Solo el rename del tipo. |
| `src/agents/orquestador/node.py` | *(modificar)* Lee `user_id` del `RunnableConfig`. |

---

## Fase A — Server

### Task 1: Partir el schema en dos tablas

**Files:**
- Modify: `project/apps/server/src/modules/llm/llm.model.ts` (reemplazo completo)

- [ ] **Step 1: Reemplazar el contenido de `llm.model.ts`**

`llm_config` desaparece. La base es de desarrollo, así que no hay migración de datos.

```ts
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "../auth/auth.model";

export const LLM_PROVIDERS = ["anthropic", "openai", "google", "openai_compatible"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

// Los agentes que pueden tener un LLM asignado. `shell` no aparece: ejecuta
// ngspice, no consume un modelo.
export const AGENT_IDS = ["orchestrator", "calculation", "writer", "curator"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const TEST_STATUSES = ["ok", "failed"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

// La credencial. No lleva modelo: el modelo es del agente, no de la cuenta.
export const llmConnection = pgTable(
  "llm_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    provider: text("provider", { enum: LLM_PROVIDERS }).notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    keyHint: text("key_hint"), // últimos 4 chars de la key, para la UI
    baseUrl: text("base_url"),
    lastTestedAt: timestamp("last_tested_at"),
    lastTestStatus: text("last_test_status", { enum: TEST_STATUSES }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("llm_connection_userId_idx").on(table.userId),
    uniqueIndex("llm_connection_userId_label_idx").on(table.userId, table.label),
  ],
);

// Qué conexión y qué modelo usa cada agente. Se materializa perezosamente:
// un agente sin fila se reporta como {connectionId: null, model: ""}.
export const agentLlmAssignment = pgTable(
  "agent_llm_assignment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id", { enum: AGENT_IDS }).notNull(),
    // SET NULL y no CASCADE: borrar una conexión desasigna al agente, que es
    // justo lo que el diálogo de borrado de la UI le promete al usuario.
    connectionId: text("connection_id").references(() => llmConnection.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_llm_assignment_userId_agentId_idx").on(table.userId, table.agentId),
    index("agent_llm_assignment_connectionId_idx").on(table.connectionId),
  ],
);
```

- [ ] **Step 2: Verificar que el schema compila**

`drizzle.config.ts` recoge `./src/**/*.model.ts` por glob, así que no hay que registrar nada.

Run: `cd project/apps/server && bun run typecheck`
Expected: errores **solo** en `llm.schemas.ts`, `llm.services.ts` y `llm.index.ts`, que todavía importan `llmConfig`. Las tareas 2, 3 y 7 los resuelven. Si aparece un error dentro de `llm.model.ts`, arreglarlo antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add project/apps/server/src/modules/llm/llm.model.ts
git commit -m "feat(server): partir llm_config en llm_connection y agent_llm_assignment"
```

- [ ] **Step 4: DETENERSE y pedir la migración**

**No continuar sin esto.** El implementador no ejecuta comandos de base de datos en este repo. Pedir al usuario:

```bash
cd project/apps/server && bun run db:push
```

Esperar confirmación explícita de que corrió antes de empezar la Task 2. Las tareas 3, 4 y 5 fallan contra un schema viejo, y el modo de fallo (columna inexistente) es confuso de diagnosticar.

---

### Task 2: Validación y vista pública

**Files:**
- Modify: `project/apps/server/src/modules/llm/llm.schemas.ts` (reemplazo completo)
- Modify: `project/apps/server/src/modules/llm/llm.schemas.test.ts` (reemplazo completo)

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar `llm.schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  createConnectionSchema,
  toPublicConnection,
  updateAssignmentSchema,
  updateConnectionSchema,
} from "./llm.schemas";

describe("createConnectionSchema", () => {
  test("acepta un provider normal con apiKey", () => {
    const result = createConnectionSchema.safeParse({
      label: "OpenAI",
      provider: "openai",
      apiKey: "sk-test-1234",
    });
    expect(result.success).toBe(true);
  });

  test("rechaza un provider normal sin apiKey", () => {
    const result = createConnectionSchema.safeParse({
      label: "OpenAI",
      provider: "openai",
    });
    expect(result.success).toBe(false);
  });

  test("acepta openai_compatible sin apiKey si trae baseUrl", () => {
    const result = createConnectionSchema.safeParse({
      label: "Ollama",
      provider: "openai_compatible",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(result.success).toBe(true);
  });

  test("rechaza openai_compatible sin baseUrl", () => {
    const result = createConnectionSchema.safeParse({
      label: "Ollama",
      provider: "openai_compatible",
    });
    expect(result.success).toBe(false);
  });

  test("ya no acepta el campo model, que ahora vive en la asignación", () => {
    const result = createConnectionSchema.safeParse({
      label: "OpenAI",
      provider: "openai",
      apiKey: "sk-test-1234",
      model: "gpt-5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("model" in result.data).toBe(false);
    }
  });
});

describe("updateConnectionSchema", () => {
  test("permite baseUrl nulo para limpiarlo", () => {
    const result = updateConnectionSchema.safeParse({ baseUrl: null });
    expect(result.success).toBe(true);
  });

  test("rechaza una apiKey vacía", () => {
    const result = updateConnectionSchema.safeParse({ apiKey: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateAssignmentSchema", () => {
  test("acepta connectionId nulo para desasignar", () => {
    const result = updateAssignmentSchema.safeParse({ connectionId: null, model: "" });
    expect(result.success).toBe(true);
  });

  test("acepta una asignación completa", () => {
    const result = updateAssignmentSchema.safeParse({
      connectionId: "conn-1",
      model: "gpt-5",
    });
    expect(result.success).toBe(true);
  });

  test("rechaza si falta model", () => {
    const result = updateAssignmentSchema.safeParse({ connectionId: "conn-1" });
    expect(result.success).toBe(false);
  });
});

describe("toPublicConnection", () => {
  const row = {
    id: "conn-1",
    userId: "user-1",
    label: "OpenAI",
    provider: "openai" as const,
    apiKeyEncrypted: "cifrado:abc",
    keyHint: "1234",
    baseUrl: null,
    lastTestedAt: new Date("2026-07-29T10:00:00.000Z"),
    lastTestStatus: "ok" as const,
    createdAt: new Date("2026-07-29T09:00:00.000Z"),
    updatedAt: new Date("2026-07-29T09:00:00.000Z"),
  };

  test("nunca expone la key, ni cifrada", () => {
    const publicView = toPublicConnection(row);
    expect(JSON.stringify(publicView)).not.toContain("cifrado:abc");
    expect("apiKeyEncrypted" in publicView).toBe(false);
    expect("userId" in publicView).toBe(false);
  });

  test("expone el estado de prueba y la pista de la key", () => {
    const publicView = toPublicConnection(row);
    expect(publicView.hasKey).toBe(true);
    expect(publicView.keyHint).toBe("1234");
    expect(publicView.lastTestStatus).toBe("ok");
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/server && bun test src/modules/llm/llm.schemas.test.ts`
Expected: FAIL — `createConnectionSchema` y las demás no existen todavía.

- [ ] **Step 3: Escribir `llm.schemas.ts`**

Reemplazo completo:

```ts
import { z } from "zod";

import { AGENT_IDS, LLM_PROVIDERS, type llmConnection } from "./llm.model";

export const providerSchema = z.enum(LLM_PROVIDERS);
export const agentIdSchema = z.enum(AGENT_IDS);

export const createConnectionSchema = z
  .object({
    label: z.string().min(1),
    provider: providerSchema,
    apiKey: z.string().min(1).optional(),
    baseUrl: z.url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "openai_compatible") {
      if (!data.baseUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["baseUrl"],
          message: "baseUrl is required for openai_compatible",
        });
      }
    } else if (!data.apiKey) {
      ctx.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: `apiKey is required for provider ${data.provider}`,
      });
    }
  });

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const updateConnectionSchema = z.object({
  label: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.url().nullable().optional(),
});

export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;

// connectionId nulo desasigna al agente; model vacío es válido.
export const updateAssignmentSchema = z.object({
  connectionId: z.string().min(1).nullable(),
  model: z.string(),
});

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

type ConnectionRow = typeof llmConnection.$inferSelect;

// vista pública: jamás incluye la key (ni cifrada ni en claro)
export function toPublicConnection(row: ConnectionRow) {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    baseUrl: row.baseUrl,
    hasKey: row.apiKeyEncrypted !== null,
    keyHint: row.keyHint,
    lastTestedAt: row.lastTestedAt,
    lastTestStatus: row.lastTestStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd project/apps/server && bun test src/modules/llm/llm.schemas.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/llm/llm.schemas.ts project/apps/server/src/modules/llm/llm.schemas.test.ts
git commit -m "feat(server): validacion de conexiones y asignaciones de LLM"
```

---

### Task 3: Servicios de conexiones

**Files:**
- Modify: `project/apps/server/src/modules/llm/llm.services.ts`
- Modify: `project/apps/server/src/modules/llm/llm.services.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar `llm.services.test.ts` con la parte de conexiones (las asignaciones se agregan en la Task 4):

```ts
import { afterAll, describe, expect, test } from "bun:test";

import {
  createConnection,
  deleteConnection,
  listConnections,
  recordConnectionTest,
  updateConnection,
} from "./llm.services";

// Integración real contra la BD (Neon). Correr con:
//   RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test
const runDb = process.env.RUN_DB_TESTS === "1";
const t = test.skipIf(!runDb);

// Debe existir en la tabla `user` cuando se ejecuten los tests de BD.
const TEST_USER_ID = process.env.TEST_USER_ID ?? "test-user-00000000";

const createdIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdIds) {
    await deleteConnection(TEST_USER_ID, id).catch(() => {});
  }
});

describe("conexiones (db)", () => {
  t("create/list/update/delete roundtrip", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-anthropic-${Date.now()}`,
      provider: "anthropic",
      apiKey: "sk-test-abcd1234",
    });
    createdIds.push(created.id);

    expect(created.userId).toBe(TEST_USER_ID);
    expect(created.apiKeyEncrypted).not.toBeNull();
    expect(created.apiKeyEncrypted).not.toContain("sk-test");
    expect(created.keyHint).toBe("1234");
    expect(created.lastTestStatus).toBeNull();

    const listed = await listConnections(TEST_USER_ID);
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const updated = await updateConnection(TEST_USER_ID, created.id, {
      label: `renombrada-${Date.now()}`,
    });
    // sin apiKey en el update, la key cifrada se conserva
    expect(updated?.apiKeyEncrypted).toBe(created.apiKeyEncrypted);
  });

  t("otro usuario no ve las conexiones del primero", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-isolation-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-isolation-test",
    });
    createdIds.push(created.id);

    const otras = await listConnections("other-user-99999999");
    expect(otras.some((r) => r.id === created.id)).toBe(false);
  });

  t("otro usuario no puede actualizar ni borrar una conexión ajena", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-tenant-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-tenant-test",
    });
    createdIds.push(created.id);

    expect(await updateConnection("other-user-99999999", created.id, { label: "hack" })).toBeNull();
    expect(await deleteConnection("other-user-99999999", created.id)).toBeNull();
    expect((await listConnections(TEST_USER_ID)).some((r) => r.id === created.id)).toBe(true);
  });

  t("recordConnectionTest guarda estado y fecha", async () => {
    const created = await createConnection(TEST_USER_ID, {
      label: `test-probe-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-probe-test",
    });
    createdIds.push(created.id);

    const updated = await recordConnectionTest(TEST_USER_ID, created.id, "failed");
    expect(updated?.lastTestStatus).toBe("failed");
    expect(updated?.lastTestedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/llm/llm.services.test.ts`
Expected: FAIL — `createConnection` no existe.

Si salen "skipped" en vez de "fail", faltó `RUN_DB_TESTS=1`. Un test saltado no valida nada; corregir antes de seguir.

- [ ] **Step 3: Escribir la parte de conexiones en `llm.services.ts`**

Reemplazar el contenido actual por esto (las asignaciones y la resolución llegan en las tareas 4 y 5):

```ts
import { and, eq } from "drizzle-orm";

import { db } from "@/db";

import { encryptApiKey } from "./llm.crypto";
import { llmConnection, type TestStatus } from "./llm.model";

import type { CreateConnectionInput, UpdateConnectionInput } from "./llm.schemas";

export async function listConnections(userId: string) {
  return db
    .select()
    .from(llmConnection)
    .where(eq(llmConnection.userId, userId))
    .orderBy(llmConnection.createdAt);
}

export async function getConnection(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(llmConnection)
    .where(and(eq(llmConnection.id, id), eq(llmConnection.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createConnection(userId: string, input: CreateConnectionInput) {
  const [row] = await db
    .insert(llmConnection)
    .values({
      userId,
      label: input.label,
      provider: input.provider,
      apiKeyEncrypted: input.apiKey ? encryptApiKey(input.apiKey) : null,
      keyHint: input.apiKey ? input.apiKey.slice(-4) : null,
      baseUrl: input.baseUrl ?? null,
    })
    .returning();
  return row!;
}

export async function updateConnection(
  userId: string,
  id: string,
  input: UpdateConnectionInput,
) {
  const values: Partial<typeof llmConnection.$inferInsert> = {};
  if (input.label !== undefined) values.label = input.label;
  if (input.baseUrl !== undefined) values.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) {
    values.apiKeyEncrypted = encryptApiKey(input.apiKey);
    values.keyHint = input.apiKey.slice(-4);
    // la credencial cambió: el resultado de la última prueba ya no aplica
    values.lastTestStatus = null;
    values.lastTestedAt = null;
  }
  if (Object.keys(values).length === 0) {
    return getConnection(userId, id);
  }
  const [row] = await db
    .update(llmConnection)
    .set(values)
    .where(and(eq(llmConnection.id, id), eq(llmConnection.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteConnection(userId: string, id: string) {
  const [row] = await db
    .delete(llmConnection)
    .where(and(eq(llmConnection.id, id), eq(llmConnection.userId, userId)))
    .returning();
  return row ?? null;
}

export async function recordConnectionTest(
  userId: string,
  id: string,
  status: TestStatus,
) {
  const [row] = await db
    .update(llmConnection)
    .set({ lastTestStatus: status, lastTestedAt: new Date() })
    .where(and(eq(llmConnection.id, id), eq(llmConnection.userId, userId)))
    .returning();
  return row ?? null;
}
```

Nota de diseño: al cambiar la `apiKey` se limpia el resultado de la prueba anterior. Dejarlo en "ok" con una llave distinta volvería a hacer que el indicador mienta, que es justo el defecto que esta rebanada corrige.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd project/apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/llm/llm.services.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/llm/llm.services.ts project/apps/server/src/modules/llm/llm.services.test.ts
git commit -m "feat(server): servicios de conexiones LLM sin modelo acoplado"
```

---

### Task 4: Servicios de asignaciones

**Files:**
- Modify: `project/apps/server/src/modules/llm/llm.services.ts` (agregar)
- Modify: `project/apps/server/src/modules/llm/llm.services.test.ts` (agregar)
- Create: `project/apps/server/src/modules/llm/llm.assignments.test.ts`

La lógica de "rellenar los agentes faltantes" es pura, así que va en su propio archivo de test y corre sin base de datos.

- [ ] **Step 1: Escribir el test puro que falla**

Crear `llm.assignments.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { fillAssignmentGaps } from "./llm.services";

describe("fillAssignmentGaps", () => {
  test("devuelve los cuatro agentes aunque no haya ninguna fila", () => {
    const result = fillAssignmentGaps([]);
    expect(result.map((r) => r.agentId)).toEqual([
      "orchestrator",
      "calculation",
      "writer",
      "curator",
    ]);
    expect(result.every((r) => r.connectionId === null && r.model === "")).toBe(true);
  });

  test("conserva las filas existentes y rellena el resto", () => {
    const result = fillAssignmentGaps([
      { agentId: "orchestrator", connectionId: "conn-1", model: "gpt-5" },
    ]);
    expect(result).toHaveLength(4);
    expect(result.find((r) => r.agentId === "orchestrator")).toEqual({
      agentId: "orchestrator",
      connectionId: "conn-1",
      model: "gpt-5",
    });
    expect(result.find((r) => r.agentId === "curator")).toEqual({
      agentId: "curator",
      connectionId: null,
      model: "",
    });
  });

  test("el orden es siempre el de AGENT_IDS, no el de las filas", () => {
    const result = fillAssignmentGaps([
      { agentId: "curator", connectionId: "conn-2", model: "haiku" },
      { agentId: "orchestrator", connectionId: "conn-1", model: "gpt-5" },
    ]);
    expect(result.map((r) => r.agentId)).toEqual([
      "orchestrator",
      "calculation",
      "writer",
      "curator",
    ]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd project/apps/server && bun test src/modules/llm/llm.assignments.test.ts`
Expected: FAIL — `fillAssignmentGaps` no existe.

- [ ] **Step 3: Agregar las asignaciones a `llm.services.ts`**

Agregar los imports que faltan al inicio del archivo y las funciones al final:

```ts
// ── ajustar los imports existentes ──
import { and, eq } from "drizzle-orm";

import { db } from "@/db";

import { encryptApiKey } from "./llm.crypto";
import { agentLlmAssignment, AGENT_IDS, llmConnection, type AgentId, type TestStatus } from "./llm.model";

import type {
  CreateConnectionInput,
  UpdateAssignmentInput,
  UpdateConnectionInput,
} from "./llm.schemas";
```

```ts
// ── agregar al final del archivo ──

export type ResolvedAssignment = {
  agentId: AgentId;
  connectionId: string | null;
  model: string;
};

// Las asignaciones se materializan perezosamente: un agente sin fila se
// reporta como vacío en lugar de sembrarse al registrar al usuario.
export function fillAssignmentGaps(rows: ResolvedAssignment[]): ResolvedAssignment[] {
  const byAgent = new Map(rows.map((row) => [row.agentId, row]));
  return AGENT_IDS.map((agentId) => {
    const row = byAgent.get(agentId);
    return {
      agentId,
      connectionId: row?.connectionId ?? null,
      model: row?.model ?? "",
    };
  });
}

export async function listAssignments(userId: string): Promise<ResolvedAssignment[]> {
  const rows = await db
    .select({
      agentId: agentLlmAssignment.agentId,
      connectionId: agentLlmAssignment.connectionId,
      model: agentLlmAssignment.model,
    })
    .from(agentLlmAssignment)
    .where(eq(agentLlmAssignment.userId, userId));
  return fillAssignmentGaps(rows);
}

// Devuelve null si la conexión referida no es de este usuario: sin esta
// comprobación, un usuario podría asignarle a su agente la credencial de otro.
export async function upsertAssignment(
  userId: string,
  agentId: AgentId,
  input: UpdateAssignmentInput,
): Promise<ResolvedAssignment | null> {
  if (input.connectionId !== null) {
    const owned = await getConnection(userId, input.connectionId);
    if (!owned) return null;
  }

  const [row] = await db
    .insert(agentLlmAssignment)
    .values({
      userId,
      agentId,
      connectionId: input.connectionId,
      model: input.model,
    })
    .onConflictDoUpdate({
      target: [agentLlmAssignment.userId, agentLlmAssignment.agentId],
      set: {
        connectionId: input.connectionId,
        model: input.model,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    agentId,
    connectionId: row!.connectionId,
    model: row!.model,
  };
}
```

- [ ] **Step 4: Correr el test puro para verificar que pasa**

Run: `cd project/apps/server && bun test src/modules/llm/llm.assignments.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Escribir el test de integración de asignaciones**

Agregar al final de `llm.services.test.ts` (y añadir `listAssignments`, `upsertAssignment` al `import` de arriba):

```ts
describe("asignaciones (db)", () => {
  t("upsert crea y luego actualiza sin duplicar", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-assign-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-assign-test",
    });
    createdIds.push(conn.id);

    const first = await upsertAssignment(TEST_USER_ID, "orchestrator", {
      connectionId: conn.id,
      model: "gpt-5",
    });
    expect(first).toEqual({ agentId: "orchestrator", connectionId: conn.id, model: "gpt-5" });

    const second = await upsertAssignment(TEST_USER_ID, "orchestrator", {
      connectionId: conn.id,
      model: "gpt-5-mini",
    });
    expect(second?.model).toBe("gpt-5-mini");

    const listed = await listAssignments(TEST_USER_ID);
    expect(listed.filter((a) => a.agentId === "orchestrator")).toHaveLength(1);
  });

  t("rechaza asignar una conexión de otro usuario", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-cross-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-cross-test",
    });
    createdIds.push(conn.id);

    const result = await upsertAssignment("other-user-99999999", "orchestrator", {
      connectionId: conn.id,
      model: "gpt-5",
    });
    expect(result).toBeNull();
  });

  t("borrar la conexión desasigna al agente en lugar de borrar la fila", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-setnull-${Date.now()}`,
      provider: "openai",
      apiKey: "sk-setnull-test",
    });
    await upsertAssignment(TEST_USER_ID, "writer", {
      connectionId: conn.id,
      model: "gpt-5",
    });

    await deleteConnection(TEST_USER_ID, conn.id);

    const listed = await listAssignments(TEST_USER_ID);
    const writer = listed.find((a) => a.agentId === "writer");
    expect(writer?.connectionId).toBeNull();
    // el modelo sobrevive: el usuario solo perdió la credencial
    expect(writer?.model).toBe("gpt-5");
  });
});
```

- [ ] **Step 6: Correr toda la suite de servicios**

Run: `cd project/apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/llm/`
Expected: PASS, todo verde.

- [ ] **Step 7: Commit**

```bash
git add project/apps/server/src/modules/llm/
git commit -m "feat(server): asignacion de conexion y modelo por agente"
```

---

### Task 5: Resolución por agente para agents

**Files:**
- Modify: `project/apps/server/src/modules/llm/llm.services.ts` (agregar)
- Modify: `project/apps/server/src/modules/llm/llm.services.test.ts` (agregar)

- [ ] **Step 1: Escribir el test que falla**

Agregar a `llm.services.test.ts` (y añadir `getAgentLlmResolved` al `import`):

```ts
describe("getAgentLlmResolved (db)", () => {
  t("devuelve la forma del contrato con la key descifrada", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-resolved-${Date.now()}`,
      provider: "anthropic",
      apiKey: "sk-resolved-9999",
    });
    createdIds.push(conn.id);
    await upsertAssignment(TEST_USER_ID, "orchestrator", {
      connectionId: conn.id,
      model: "claude-sonnet-5",
    });

    const resolved = await getAgentLlmResolved(TEST_USER_ID, "orchestrator");
    expect(resolved).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      api_key: "sk-resolved-9999",
      base_url: null,
    });
  });

  t("devuelve null para un agente sin asignación", async () => {
    const resolved = await getAgentLlmResolved(TEST_USER_ID, "curator");
    expect(resolved).toBeNull();
  });

  t("devuelve null si el agente está asignado pero sin conexión", async () => {
    await upsertAssignment(TEST_USER_ID, "calculation", {
      connectionId: null,
      model: "gpt-5",
    });
    const resolved = await getAgentLlmResolved(TEST_USER_ID, "calculation");
    expect(resolved).toBeNull();
  });

  t("openai_compatible resuelve sin api_key", async () => {
    const conn = await createConnection(TEST_USER_ID, {
      label: `test-ollama-${Date.now()}`,
      provider: "openai_compatible",
      baseUrl: "http://localhost:11434/v1",
    });
    createdIds.push(conn.id);
    await upsertAssignment(TEST_USER_ID, "writer", {
      connectionId: conn.id,
      model: "llama3.1:8b",
    });

    const resolved = await getAgentLlmResolved(TEST_USER_ID, "writer");
    expect(resolved).toEqual({
      provider: "openai_compatible",
      model: "llama3.1:8b",
      api_key: null,
      base_url: "http://localhost:11434/v1",
    });
  });

  t("no resuelve la asignación de otro usuario", async () => {
    const resolved = await getAgentLlmResolved("other-user-99999999", "orchestrator");
    expect(resolved).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd project/apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/llm/llm.services.test.ts`
Expected: FAIL — `getAgentLlmResolved` no existe.

- [ ] **Step 3: Implementar**

Cambiar el import del crypto a `import { decryptApiKey, encryptApiKey } from "./llm.crypto";` y agregar al final:

```ts
// Única función que descifra una key: alimenta el endpoint interno de agents.
// Devuelve null (→ 404) cuando el agente no tiene asignación, cuando no tiene
// conexión, o cuando la conexión carece de key y su provider la exige.
export async function getAgentLlmResolved(userId: string, agentId: AgentId) {
  const [row] = await db
    .select({
      provider: llmConnection.provider,
      apiKeyEncrypted: llmConnection.apiKeyEncrypted,
      baseUrl: llmConnection.baseUrl,
      model: agentLlmAssignment.model,
    })
    .from(agentLlmAssignment)
    .innerJoin(llmConnection, eq(agentLlmAssignment.connectionId, llmConnection.id))
    .where(
      and(
        eq(agentLlmAssignment.userId, userId),
        eq(agentLlmAssignment.agentId, agentId),
      ),
    )
    .limit(1);

  if (!row) return null;
  // openai_compatible queda exento: endpoints locales como Ollama no piden key,
  // y build_chat_model del lado de agents ya contempla api_key nulo.
  if (!row.apiKeyEncrypted && row.provider !== "openai_compatible") return null;

  return {
    provider: row.provider,
    model: row.model,
    api_key: row.apiKeyEncrypted ? decryptApiKey(row.apiKeyEncrypted) : null,
    base_url: row.baseUrl,
  };
}
```

El `innerJoin` hace el trabajo del caso "connectionId nulo": esa fila no une y el resultado es vacío.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd project/apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test src/modules/llm/llm.services.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/llm/
git commit -m "feat(server): resolver la config de LLM por agente y usuario"
```

---

### Task 6: Sonda de proveedores

**Files:**
- Create: `project/apps/server/src/modules/llm/llm.providers.ts`
- Create: `project/apps/server/src/modules/llm/llm.providers.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `llm.providers.test.ts`. No toca la red: `probeConnection` recibe el `fetch` por parámetro.

```ts
import { describe, expect, test } from "bun:test";

import { buildProbeRequest, probeConnection } from "./llm.providers";

describe("buildProbeRequest", () => {
  test("OpenAI usa el header Authorization", () => {
    const req = buildProbeRequest({ provider: "openai", apiKey: "sk-1", baseUrl: null });
    expect(req?.url).toBe("https://api.openai.com/v1/models");
    expect(req?.headers.Authorization).toBe("Bearer sk-1");
  });

  test("Anthropic usa x-api-key y exige la versión", () => {
    const req = buildProbeRequest({ provider: "anthropic", apiKey: "sk-2", baseUrl: null });
    expect(req?.url).toBe("https://api.anthropic.com/v1/models");
    expect(req?.headers["x-api-key"]).toBe("sk-2");
    expect(req?.headers["anthropic-version"]).toBe("2023-06-01");
  });

  test("Google manda la key en el query string", () => {
    const req = buildProbeRequest({ provider: "google", apiKey: "sk-3", baseUrl: null });
    expect(req?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?key=sk-3",
    );
  });

  test("openai_compatible cuelga /models del baseUrl sin duplicar la diagonal", () => {
    const req = buildProbeRequest({
      provider: "openai_compatible",
      apiKey: null,
      baseUrl: "http://localhost:11434/v1/",
    });
    expect(req?.url).toBe("http://localhost:11434/v1/models");
  });

  test("devuelve null si falta la credencial que el provider exige", () => {
    expect(buildProbeRequest({ provider: "openai", apiKey: null, baseUrl: null })).toBeNull();
    expect(
      buildProbeRequest({ provider: "openai_compatible", apiKey: null, baseUrl: null }),
    ).toBeNull();
  });
});

describe("probeConnection", () => {
  test("200 del proveedor -> ok", async () => {
    const fakeFetch = async () => new Response("{}", { status: 200 });
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-1", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: true });
  });

  test("401 del proveedor -> falla mencionando la credencial", async () => {
    const fakeFetch = async () => new Response("no", { status: 401 });
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-mala", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("credencial");
  });

  test("otro status -> falla reportando el código", async () => {
    const fakeFetch = async () => new Response("boom", { status: 503 });
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-1", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("503");
  });

  test("error de red -> falla sin lanzar excepción", async () => {
    const fakeFetch = async () => {
      throw new TypeError("fetch failed");
    };
    const result = await probeConnection(
      { provider: "openai", apiKey: "sk-1", baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("alcanzar");
  });

  test("credencial faltante -> falla sin hacer ninguna petición", async () => {
    let llamadas = 0;
    const fakeFetch = async () => {
      llamadas += 1;
      return new Response("{}", { status: 200 });
    };
    const result = await probeConnection(
      { provider: "openai", apiKey: null, baseUrl: null },
      fakeFetch as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(llamadas).toBe(0);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/server && bun test src/modules/llm/llm.providers.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir `llm.providers.ts`**

```ts
import type { LlmProvider } from "./llm.model";

export type ProbeInput = {
  provider: LlmProvider;
  apiKey: string | null;
  baseUrl: string | null;
};

export type ProbeRequest = {
  url: string;
  headers: Record<string, string>;
};

export type ProbeResult = { ok: true } | { ok: false; error: string };

// Se prueba listando modelos y no con una completion: valida la credencial y el
// endpoint, no gasta tokens, y no necesita un nombre de modelo (que ya no vive
// en la conexión).
export function buildProbeRequest(input: ProbeInput): ProbeRequest | null {
  switch (input.provider) {
    case "openai":
      if (!input.apiKey) return null;
      return {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${input.apiKey}` },
      };
    case "anthropic":
      if (!input.apiKey) return null;
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: {
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01",
        },
      };
    case "google":
      if (!input.apiKey) return null;
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(input.apiKey)}`,
        headers: {},
      };
    case "openai_compatible": {
      if (!input.baseUrl) return null;
      const base = input.baseUrl.replace(/\/+$/, "");
      return {
        url: `${base}/models`,
        // la key es opcional en endpoints locales
        headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {},
      };
    }
  }
}

export async function probeConnection(
  input: ProbeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const request = buildProbeRequest(input);
  if (!request) {
    return { ok: false, error: "Falta la credencial que este proveedor requiere." };
  }

  try {
    const response = await fetchImpl(request.url, {
      method: "GET",
      headers: request.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { ok: true };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "El proveedor rechazó la credencial." };
    }
    return { ok: false, error: `El proveedor respondió ${response.status}.` };
  } catch {
    // incluye timeout y DNS: para el usuario es el mismo problema
    return { ok: false, error: "No se pudo alcanzar al proveedor." };
  }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd project/apps/server && bun test src/modules/llm/llm.providers.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/server/src/modules/llm/llm.providers.ts project/apps/server/src/modules/llm/llm.providers.test.ts
git commit -m "feat(server): sonda de credenciales por listado de modelos"
```

---

### Task 7: Router encadenado

**Files:**
- Modify: `project/apps/server/src/modules/llm/llm.index.ts` (reemplazo completo)
- Modify: `project/apps/server/src/modules/llm/llm.routes.test.ts` (reemplazo completo)

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar `llm.routes.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import app from "@/app";
import env from "@/lib/env";

describe("rutas de administración de LLM", () => {
  test("GET /api/llm/connections sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/connections");
    expect(res.status).toBe(401);
  });

  test("POST /api/llm/connections sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x", provider: "anthropic", apiKey: "k" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/llm/connections/:id/test sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/connections/some-id/test", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("GET /api/llm/assignments sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/assignments");
    expect(res.status).toBe(401);
  });

  test("PUT /api/llm/assignments/:agentId sin sesión -> 401", async () => {
    const res = await app.request("/api/llm/assignments/orchestrator", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: null, model: "" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("endpoint interno para agents", () => {
  const internalUrl = "/api/internal/llm/agent/orchestrator?userId=user-1";

  test("401 sin token", async () => {
    const res = await app.request(internalUrl);
    expect(res.status).toBe(401);
  });

  test("401 con token incorrecto", async () => {
    const res = await app.request(internalUrl, {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("400 sin el query param userId", async () => {
    const res = await app.request("/api/internal/llm/agent/orchestrator", {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect(res.status).toBe(400);
  });

  test("400 con un agentId desconocido", async () => {
    const res = await app.request("/api/internal/llm/agent/inexistente?userId=user-1", {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect(res.status).toBe(400);
  });

  // Integración con BD: 404 sin asignación / 200 con la forma del contrato.
  const runDb = process.env.RUN_DB_TESTS === "1";
  test.skipIf(!runDb)("200 o 404 con token válido (forma del contrato)", async () => {
    const userId = process.env.TEST_USER_ID ?? "test-user-00000000";
    const res = await app.request(`/api/internal/llm/agent/orchestrator?userId=${userId}`, {
      headers: { authorization: `Bearer ${env.AGENTS_SERVICE_TOKEN}` },
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["api_key", "base_url", "model", "provider"]);
    }
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/server && bun test src/modules/llm/llm.routes.test.ts`
Expected: FAIL — las rutas nuevas devuelven 404 en vez de 401/400.

- [ ] **Step 3: Escribir `llm.index.ts`**

Reemplazo completo. Encadenado en una sola expresión, como `auth.index.ts`, para que `AppType` lleve las rutas al client. `requireAuth` va por ruta, no con `.use()`.

```ts
import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { createRouter } from "@/lib/create-app";
import env from "@/lib/env";
import { requireAuth } from "@/middleware/session";

import { AGENT_IDS, type AgentId } from "./llm.model";
import { probeConnection } from "./llm.providers";
import {
  agentIdSchema,
  createConnectionSchema,
  toPublicConnection,
  updateAssignmentSchema,
  updateConnectionSchema,
} from "./llm.schemas";
import {
  createConnection,
  deleteConnection,
  getAgentLlmResolved,
  getConnection,
  listAssignments,
  listConnections,
  recordConnectionTest,
  updateConnection,
  upsertAssignment,
} from "./llm.services";

function isValidServiceToken(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(env.AGENTS_SERVICE_TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

export const llmRouter = createRouter()
  .get("/api/llm/connections", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const rows = await listConnections(userId);
    return c.json(rows.map(toPublicConnection));
  })
  .post("/api/llm/connections", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = createConnectionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await createConnection(userId, parsed.data);
    return c.json(toPublicConnection(row), 201);
  })
  .patch("/api/llm/connections/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const parsed = updateConnectionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await updateConnection(userId, c.req.param("id"), parsed.data);
    if (!row) return c.json({ error: "Not Found" }, 404);
    return c.json(toPublicConnection(row));
  })
  .delete("/api/llm/connections/:id", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const row = await deleteConnection(userId, c.req.param("id"));
    if (!row) return c.json({ error: "Not Found" }, 404);
    return c.json({ deleted: row.id });
  })
  .post("/api/llm/connections/:id/test", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const row = await getConnection(userId, c.req.param("id"));
    if (!row) return c.json({ error: "Not Found" }, 404);

    // La key se descifra aquí y no sale del server: la sonda solo la usa
    // para armar el header.
    const { getConnectionCredentials } = await import("./llm.services");
    const credentials = await getConnectionCredentials(userId, row.id);
    const result = await probeConnection({
      provider: row.provider,
      apiKey: credentials?.apiKey ?? null,
      baseUrl: row.baseUrl,
    });

    await recordConnectionTest(userId, row.id, result.ok ? "ok" : "failed");
    // 200 siempre: es un diagnóstico, no un fallo de la petición.
    return c.json(result);
  })
  .get("/api/llm/assignments", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    return c.json(await listAssignments(userId));
  })
  .put("/api/llm/assignments/:agentId", requireAuth, async (c) => {
    const { id: userId } = c.get("user")!;
    const agentId = agentIdSchema.safeParse(c.req.param("agentId"));
    if (!agentId.success) {
      return c.json({ error: "Unknown agentId" }, 400);
    }
    const parsed = updateAssignmentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: z.treeifyError(parsed.error) }, 400);
    }
    const row = await upsertAssignment(userId, agentId.data, parsed.data);
    if (!row) return c.json({ error: "Connection Not Found" }, 404);
    return c.json(row);
  })
  // Endpoint interno consumido por agents. El userId viaja como query param;
  // está protegido por el service token.
  .get("/api/internal/llm/agent/:agentId", async (c) => {
    if (!isValidServiceToken(c.req.header("authorization"))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const agentId = c.req.param("agentId");
    if (!isAgentId(agentId)) {
      return c.json({ error: "Unknown agentId" }, 400);
    }
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ error: "userId query param is required" }, 400);
    }
    const resolved = await getAgentLlmResolved(userId, agentId);
    if (!resolved) {
      return c.json({ error: "No LLM configured for this agent" }, 404);
    }
    return c.json(resolved);
  });
```

- [ ] **Step 4: Agregar `getConnectionCredentials` a `llm.services.ts`**

El handler de prueba la necesita. Reemplazar el `await import(...)` por un import normal al inicio del archivo una vez que exista:

En `llm.services.ts`, agregar al final:

```ts
// Descifra la key de una conexión concreta, solo para la sonda de prueba.
// Se mantiene aparte de getAgentLlmResolved porque responde otra pregunta:
// "¿sirve esta credencial?", no "¿qué usa este agente?".
export async function getConnectionCredentials(userId: string, id: string) {
  const row = await getConnection(userId, id);
  if (!row) return null;
  return {
    apiKey: row.apiKeyEncrypted ? decryptApiKey(row.apiKeyEncrypted) : null,
  };
}
```

En `llm.index.ts`, quitar el `await import("./llm.services")` dinámico y mover `getConnectionCredentials` al bloque de imports de arriba:

```ts
import {
  createConnection,
  deleteConnection,
  getAgentLlmResolved,
  getConnection,
  getConnectionCredentials,
  listAssignments,
  listConnections,
  recordConnectionTest,
  updateConnection,
  upsertAssignment,
} from "./llm.services";
```

y en el handler:

```ts
    const credentials = await getConnectionCredentials(userId, row.id);
```

- [ ] **Step 5: Correr los tests y el typecheck**

Run: `cd project/apps/server && bun test && bun run typecheck`
Expected: PASS en ambos. El typecheck ya no debe reportar nada sobre `llmConfig`.

- [ ] **Step 6: Regenerar los tipos que consume el client**

Este paso es fácil de olvidar y rompe la Task 11 de forma confusa.

Run: `cd project/apps/server && bun run build:types`
Expected: termina sin errores.

- [ ] **Step 7: Commit**

```bash
git add project/apps/server/src/modules/llm/
git commit -m "feat(server): rutas encadenadas de conexiones, asignaciones y sonda"
```

---

## Fase B — Agents

### Task 8: Resolver el LLM por agente y por usuario

**Files:**
- Modify: `project/apps/agents/src/agents/llm/settings_client.py` (reemplazo completo)
- Modify: `project/apps/agents/src/agents/llm/factory.py` (solo el nombre del tipo)
- Modify: `project/apps/agents/tests/test_settings_client.py` (reemplazo completo)
- Modify: `project/apps/agents/tests/test_factory.py` (solo el nombre del tipo)

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar `tests/test_settings_client.py`. Los dos tests marcados con comentario son los que fijan los defectos que esta tarea corrige.

```python
import time

import httpx
import pytest

from agents.llm import settings_client
from agents.llm.settings_client import (
    AgentLlmConfig,
    LlmSettingsError,
    fetch_agent_llm,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    settings_client._CACHE.clear()
    yield
    settings_client._CACHE.clear()


def _transport(handler):
    return httpx.MockTransport(handler)


def _ok_handler(request):
    return httpx.Response(
        200,
        json={
            "provider": "anthropic",
            "model": "claude-sonnet-5",
            "api_key": "sk-ant-test",
            "base_url": None,
        },
    )


def _fetch(handler, **kwargs):
    params = {
        "agent_id": "orchestrator",
        "user_id": "user-1",
        "base_url": "http://server.test",
        "token": "tok",
        "transport": _transport(handler),
    }
    params.update(kwargs)
    return fetch_agent_llm(**params)


def test_parses_valid_response():
    config = _fetch(_ok_handler)
    assert config == AgentLlmConfig(
        provider="anthropic",
        model="claude-sonnet-5",
        api_key="sk-ant-test",
        base_url=None,
    )


def test_sends_bearer_token():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers.get("authorization")
        return _ok_handler(request)

    _fetch(handler)
    assert seen["auth"] == "Bearer tok"


# Defecto corregido: antes nunca se enviaba userId y el server respondía 400.
def test_sends_agent_id_in_path_and_user_id_in_query():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        return _ok_handler(request)

    _fetch(handler, agent_id="curator", user_id="user-42")
    assert "/api/internal/llm/agent/curator" in seen["url"]
    assert "userId=user-42" in seen["url"]


def test_404_raises_typed_error():
    def handler(request):
        return httpx.Response(404, json={"error": "No LLM configured for this agent"})

    with pytest.raises(LlmSettingsError, match="no LLM configured"):
        _fetch(handler)


def test_401_raises_typed_error():
    def handler(request):
        return httpx.Response(401, json={"error": "Unauthorized"})

    with pytest.raises(LlmSettingsError, match="unauthorized"):
        _fetch(handler)


def test_400_raises_typed_error():
    def handler(request):
        return httpx.Response(400, json={"error": "userId query param is required"})

    with pytest.raises(LlmSettingsError, match="unexpected status 400"):
        _fetch(handler)


def test_malformed_payload_raises_typed_error():
    def handler(request):
        return httpx.Response(200, json={"provider": "anthropic"})  # faltan campos

    with pytest.raises(LlmSettingsError, match="invalid payload"):
        _fetch(handler)


def test_connection_error_raises_typed_error():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(LlmSettingsError, match="unreachable"):
        _fetch(handler)


def test_missing_env_raises_typed_error(monkeypatch):
    monkeypatch.delenv("SERVER_BASE_URL", raising=False)
    monkeypatch.delenv("AGENTS_SERVICE_TOKEN", raising=False)

    with pytest.raises(LlmSettingsError, match="not configured"):
        fetch_agent_llm(agent_id="orchestrator", user_id="user-1")


def test_cache_avoids_second_fetch_within_ttl():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    for _ in range(2):
        fetch_agent_llm(
            agent_id="orchestrator",
            user_id="user-1",
            base_url="http://server.test",
            token="tok",
            transport=transport,
        )
    assert calls["n"] == 1


# Defecto corregido: el cache usaba la clave fija "default", así que el segundo
# usuario recibía la configuración del primero, API key incluida.
def test_cache_is_not_shared_between_users():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(
            200,
            json={
                "provider": "anthropic",
                "model": f"model-para-{request.url.params.get('userId')}",
                "api_key": f"sk-de-{request.url.params.get('userId')}",
                "base_url": None,
            },
        )

    transport = _transport(handler)
    primero = fetch_agent_llm(
        agent_id="orchestrator", user_id="user-a",
        base_url="http://server.test", token="tok", transport=transport,
    )
    segundo = fetch_agent_llm(
        agent_id="orchestrator", user_id="user-b",
        base_url="http://server.test", token="tok", transport=transport,
    )

    assert calls["n"] == 2
    assert primero.api_key == "sk-de-user-a"
    assert segundo.api_key == "sk-de-user-b"


def test_cache_is_not_shared_between_agents():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fetch_agent_llm(
        agent_id="orchestrator", user_id="user-a",
        base_url="http://server.test", token="tok", transport=transport,
    )
    fetch_agent_llm(
        agent_id="curator", user_id="user-a",
        base_url="http://server.test", token="tok", transport=transport,
    )
    assert calls["n"] == 2


def test_cache_expires_after_ttl(monkeypatch):
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fake_time = {"t": 1000.0}
    monkeypatch.setattr(time, "monotonic", lambda: fake_time["t"])

    fetch_agent_llm(
        agent_id="orchestrator", user_id="user-1",
        base_url="http://server.test", token="tok", transport=transport,
    )
    fake_time["t"] += 61.0
    fetch_agent_llm(
        agent_id="orchestrator", user_id="user-1",
        base_url="http://server.test", token="tok", transport=transport,
    )
    assert calls["n"] == 2
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/agents && uv run pytest tests/test_settings_client.py -v`
Expected: FAIL — `ImportError: cannot import name 'AgentLlmConfig'`.

- [ ] **Step 3: Escribir `settings_client.py`**

Reemplazo completo:

```python
import os
import time

import httpx
from pydantic import BaseModel, ValidationError


class AgentLlmConfig(BaseModel):
    provider: str
    model: str
    api_key: str | None
    base_url: str | None


class LlmSettingsError(Exception):
    """Fallo al resolver el LLM desde el server. Nunca se propaga
    como excepción no capturada fuera del orquestador."""


# La clave incluye el usuario: una clave fija filtraría la API key de un
# usuario a otro durante la ventana del TTL.
_CACHE: dict[tuple[str, str], tuple[float, AgentLlmConfig]] = {}
_CACHE_TTL_SECONDS = 60.0


def fetch_agent_llm(
    agent_id: str,
    user_id: str,
    base_url: str | None = None,
    token: str | None = None,
    transport: httpx.BaseTransport | None = None,
) -> AgentLlmConfig:
    """Obtiene del server la configuración de LLM de un agente para un usuario,
    con cache en memoria (TTL 60s) por par (agent_id, user_id).

    `transport` es inyectable para tests (httpx.MockTransport); en
    producción se usa el transport HTTP real de httpx.
    """
    now = time.monotonic()
    cache_key = (agent_id, user_id)
    cached = _CACHE.get(cache_key)
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    base_url = base_url or os.environ.get("SERVER_BASE_URL")
    token = token or os.environ.get("AGENTS_SERVICE_TOKEN")
    if not base_url or not token:
        raise LlmSettingsError(
            "SERVER_BASE_URL / AGENTS_SERVICE_TOKEN not configured"
        )

    client_kwargs = {"transport": transport} if transport is not None else {}
    try:
        with httpx.Client(**client_kwargs, timeout=5.0) as client:
            response = client.get(
                f"{base_url}/api/internal/llm/agent/{agent_id}",
                params={"userId": user_id},
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.ConnectError as exc:
        raise LlmSettingsError(f"server unreachable: {exc}") from exc
    except httpx.TimeoutException as exc:
        raise LlmSettingsError(f"server timeout: {exc}") from exc

    if response.status_code == 404:
        raise LlmSettingsError(
            f"no LLM configured for agent {agent_id}"
        )
    if response.status_code == 401:
        raise LlmSettingsError("unauthorized: invalid AGENTS_SERVICE_TOKEN")
    if response.status_code != 200:
        raise LlmSettingsError(f"unexpected status {response.status_code} from server")

    try:
        config = AgentLlmConfig.model_validate(response.json())
    except ValidationError as exc:
        raise LlmSettingsError(f"invalid payload from server: {exc}") from exc

    _CACHE[cache_key] = (now, config)
    return config
```

- [ ] **Step 4: Actualizar el nombre del tipo en `factory.py`**

Dos líneas, `src/agents/llm/factory.py`:

```python
from agents.llm.settings_client import AgentLlmConfig
```

```python
def build_chat_model(config: AgentLlmConfig):
```

- [ ] **Step 5: Actualizar `tests/test_factory.py`**

Run: `cd project/apps/agents && grep -n "ActiveLlmConfig" tests/test_factory.py`

Sustituir cada aparición de `ActiveLlmConfig` por `AgentLlmConfig`, tanto en el import como en los usos.

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `cd project/apps/agents && uv run pytest tests/test_settings_client.py tests/test_factory.py -v`
Expected: PASS. Confirmar que `test_cache_is_not_shared_between_users` aparece como pasado — es el que fija la fuga entre cuentas.

- [ ] **Step 7: Verificar que no queda ninguna referencia al nombre viejo**

Run: `cd project/apps/agents && grep -rn "fetch_active_llm\|ActiveLlmConfig" src tests`
Expected: solo aparece en `src/agents/orquestador/node.py`, que se arregla en la Task 9. Cualquier otra aparición hay que corregirla ahora.

- [ ] **Step 8: Commit**

```bash
git add project/apps/agents/src/agents/llm/ project/apps/agents/tests/test_settings_client.py project/apps/agents/tests/test_factory.py
git commit -m "fix(agents): resolver el LLM por agente y usuario, y aislar el cache

El cache usaba la clave fija 'default', asi que dentro de la ventana de 60s
un segundo usuario recibia la configuracion del primero, API key incluida.
Ademas nunca se enviaba userId, que el server exige."
```

---

### Task 9: El orquestador recibe el `user_id` de la corrida

**Files:**
- Modify: `project/apps/agents/src/agents/orquestador/node.py`
- Modify: `project/apps/agents/tests/test_orquestador.py` (agregar)

El `user_id` viaja en el `configurable` del `RunnableConfig` de LangGraph, no en `CircuitState`: es identidad de la corrida, no un dato del circuito.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/test_orquestador.py`:

```python
def test_orquestador_pasa_user_id_y_agent_id_al_resolver_el_llm(monkeypatch):
    """El nodo debe pedir la config del agente 'orchestrator' para el usuario
    de la corrida, no una config global."""
    from agents.orquestador import node as node_module

    visto = {}

    def fake_fetch(agent_id, user_id):
        visto["agent_id"] = agent_id
        visto["user_id"] = user_id
        raise node_module.LlmSettingsError("cortocircuito intencional")

    monkeypatch.setattr(node_module, "fetch_agent_llm", fake_fetch)

    result = node_module.orquestador_node(
        {"request_text": "un divisor de voltaje de 5V a 2.5V"},
        {"configurable": {"user_id": "user-77"}},
    )

    assert visto == {"agent_id": "orchestrator", "user_id": "user-77"}
    assert result["verdict"]["status"] == "rejected"


def test_orquestador_rechaza_sin_user_id_en_la_config():
    from agents.orquestador import node as node_module

    result = node_module.orquestador_node(
        {"request_text": "un divisor de voltaje de 5V a 2.5V"},
        {"configurable": {}},
    )

    assert result["verdict"]["status"] == "rejected"
    assert "user_id" in result["verdict"]["reason"]


def test_orquestador_con_circuit_spec_no_necesita_user_id():
    """La ruta estructurada no usa LLM, así que no debe exigir identidad."""
    from agents.orquestador import node as node_module

    result = node_module.orquestador_node(
        {
            "circuit_spec": {
                "blocks": [
                    {
                        "id": "b1",
                        "type": "voltage_divider",
                        "params": {"v_in": 5.0, "v_out": 2.5, "i_min": 0.001},
                    }
                ],
                "tolerance": 0.05,
                "max_iterations": 5,
            }
        },
        {"configurable": {}},
    )

    assert result.get("verdict") is None
    assert result["pending_blocks"] == ["b1"]
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/agents && uv run pytest tests/test_orquestador.py -v`
Expected: FAIL — `orquestador_node()` recibe un argumento de más.

Si el tercer test falla por la forma de `circuit_spec`, ajustar los parámetros a lo que exija `src/agents/orquestador/schema.py`; el resto del test sigue igual.

- [ ] **Step 3: Modificar `node.py`**

Cambiar el import de la línea 5:

```python
from agents.llm.settings_client import LlmSettingsError, fetch_agent_llm
```

Reemplazar `get_chat_model` (líneas 17-24):

```python
# El agente al que corresponde este nodo, para pedir su configuración de LLM.
AGENT_ID = "orchestrator"


def get_chat_model(user_id: str):
    """Resuelve el LLM de este agente para el usuario de la corrida y construye
    el chat model.

    Punto de indirección a nivel de módulo: los tests lo sustituyen (monkeypatch)
    por un fake para no depender de red ni del server.
    """
    config = fetch_agent_llm(AGENT_ID, user_id)
    return build_chat_model(config)
```

Reemplazar la firma y el bloque de `request_text` de `orquestador_node` (líneas 57-66):

```python
def orquestador_node(state: CircuitState, config: dict | None = None) -> dict:
    request_text = state.get("request_text")
    circuit_spec = state.get("circuit_spec")

    if request_text:
        user_id = (config or {}).get("configurable", {}).get("user_id")
        if not user_id:
            return _rejected("missing user_id in run config")

        try:
            chat_model = get_chat_model(user_id)
        except LlmSettingsError as exc:
            return _rejected(f"llm_settings_unavailable: {exc}")
```

El resto del cuerpo de la función queda igual.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd project/apps/agents && uv run pytest tests/test_orquestador.py -v`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite de agents**

Run: `cd project/apps/agents && uv run pytest`
Expected: PASS. Requiere el binario `ngspice` en el `PATH`; los tests de simulación lo ejecutan de verdad.

Si `tests/test_graph.py` falla porque el grafo invoca `orquestador_node` sin config, agregar `config={"configurable": {"user_id": "test-user"}}` a las llamadas `graph.invoke(...)` de ese archivo que usen `request_text`. Las que usan `circuit_spec` no lo necesitan.

- [ ] **Step 6: Commit**

```bash
git add project/apps/agents/src/agents/orquestador/node.py project/apps/agents/tests/
git commit -m "feat(agents): el orquestador resuelve su LLM con el user_id de la corrida"
```

---

## Fase C — Client

### Task 10: Tipos, fixtures y paridad del mock

**Files:**
- Modify: `project/apps/client/src/features/settings/model/settings-types.ts`
- Modify: `project/apps/client/src/features/settings/services/settings-service.ts`
- Modify: `project/apps/client/src/features/settings/model/settings-fixtures.ts`
- Modify: `project/apps/client/src/features/settings/services/mock-settings-service.ts`

- [ ] **Step 1: Actualizar `settings-types.ts`**

`LlmConnection` gana el estado de prueba. `AgentAssignment` conserva `label` porque los componentes la usan; quien la rellena cambia en la Task 11.

```ts
export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai_compatible'

export type AgentId = 'orchestrator' | 'calculation' | 'writer' | 'curator'

export type ConnectionTestStatus = 'ok' | 'failed'

export type UserProfile = {
  name: string
  email: string
  avatarUrl: string | null
}

export type ConnectionInput = {
  label: string
  provider: LlmProvider
  apiKey: string
  baseUrl: string
}

export type LlmConnection = {
  id: string
  label: string
  provider: LlmProvider
  baseUrl: string | null
  hasKey: boolean
  keyHint: string | null
  lastTestStatus: ConnectionTestStatus | null
  lastTestedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ConnectionTestResult = { ok: true } | { ok: false; error: string }

export type AgentAssignment = {
  agentId: AgentId
  label: string
  connectionId: string | null
  model: string
}

export type AgentAssignmentInput = Pick<
  AgentAssignment,
  'connectionId' | 'model'
>

// El texto de los agentes es copy de la interfaz, no dato del server.
export const AGENT_LABELS: Record<AgentId, string> = {
  orchestrator: 'Orquestador',
  calculation: 'Cálculo',
  writer: 'Escritura',
  curator: 'Curador',
}

export const AGENT_ORDER: AgentId[] = ['orchestrator', 'calculation', 'writer', 'curator']
```

- [ ] **Step 2: Actualizar la interfaz `settings-service.ts`**

```ts
import type {
  AgentAssignment,
  AgentAssignmentInput,
  AgentId,
  ConnectionInput,
  ConnectionTestResult,
  LlmConnection,
  UserProfile,
} from '../model/settings-types'

export type SettingsService = {
  getProfile(): Promise<UserProfile>
  updateProfile(input: Pick<UserProfile, 'name' | 'avatarUrl'>): Promise<UserProfile>
  listConnections(): Promise<LlmConnection[]>
  createConnection(input: ConnectionInput): Promise<LlmConnection>
  updateConnection(id: string, input: ConnectionInput): Promise<LlmConnection>
  deleteConnection(id: string): Promise<void>
  testConnection(id: string): Promise<ConnectionTestResult>
  listAgentAssignments(): Promise<AgentAssignment[]>
  updateAgentAssignment(agentId: AgentId, input: AgentAssignmentInput): Promise<AgentAssignment>
}
```

- [ ] **Step 3: Actualizar `settings-fixtures.ts`**

```ts
import type {
  AgentAssignment,
  LlmConnection,
  UserProfile,
} from './settings-types'

export const userProfileFixture: UserProfile = {
  name: 'Antonio',
  email: 'antonio@example.com',
  avatarUrl: null,
}

export const connectionsFixture: LlmConnection[] = [
  {
    id: 'connection-openai',
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: null,
    hasKey: true,
    keyHint: '7890',
    lastTestStatus: 'ok',
    lastTestedAt: '2026-07-15T12:00:00.000Z',
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
  },
]

export const agentAssignmentsFixture: AgentAssignment[] = [
  { agentId: 'orchestrator', label: 'Orquestador', connectionId: 'connection-openai', model: 'gpt-5' },
  { agentId: 'calculation', label: 'Cálculo', connectionId: 'connection-openai', model: 'gpt-5-mini' },
  { agentId: 'writer', label: 'Escritura', connectionId: null, model: '' },
  { agentId: 'curator', label: 'Curador', connectionId: null, model: '' },
]
```

- [ ] **Step 4: Dar paridad al mock**

En `mock-settings-service.ts`, dentro del objeto devuelto por `createMockSettingsService`, agregar después de `deleteConnection`:

```ts
    async testConnection(id) {
      const index = connections.findIndex((item) => item.id === id)
      if (index < 0) throw new Error(`Connection not found: ${id}`)
      // el mock reporta éxito si hay key; basta para ejercitar la interfaz
      const ok = connections[index].hasKey || Boolean(connections[index].baseUrl)
      connections[index] = {
        ...connections[index],
        lastTestStatus: ok ? 'ok' : 'failed',
        lastTestedAt: new Date().toISOString(),
      }
      return ok ? { ok: true } : { ok: false, error: 'Sin credencial' }
    },
```

Y en `createConnection`, agregar los campos nuevos al objeto `connection`:

```ts
        ...keyMetadata(input.apiKey),
        lastTestStatus: null,
        lastTestedAt: null,
        createdAt: now,
        updatedAt: now,
```

- [ ] **Step 5: Correr la suite del client**

Run: `cd project/apps/client && npm test`
Expected: PASS. Si algún test de componente falla por los campos nuevos en los fixtures, actualizar el test, no el fixture.

- [ ] **Step 6: Commit**

```bash
git add project/apps/client/src/features/settings/
git commit -m "feat(client): tipos y mock de settings con estado de prueba de conexion"
```

---

### Task 11: `HttpSettingsService`

**Files:**
- Create: `project/apps/client/src/features/settings/services/http-settings-service.ts`
- Create: `project/apps/client/src/features/settings/services/http-settings-service.test.ts`

**Precondición:** la Task 7 Step 6 (`bun run build:types`) debe haber corrido, o los tipos de `rpc` no incluirán las rutas nuevas.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `http-settings-service.test.ts`. Se prueba contra un doble del cliente RPC, no contra la red.

```ts
import { describe, expect, it, vi } from 'vitest'

import { createHttpSettingsService } from './http-settings-service'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const connectionRow = {
  id: 'conn-1',
  label: 'OpenAI',
  provider: 'openai',
  baseUrl: null,
  hasKey: true,
  keyHint: '7890',
  lastTestStatus: null,
  lastTestedAt: null,
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
}

describe('createHttpSettingsService', () => {
  it('lista las conexiones desde el server', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([connectionRow]))
    const service = createHttpSettingsService({ fetchImpl })

    const result = await service.listConnections()

    expect(result).toEqual([connectionRow])
    expect(fetchImpl.mock.calls[0][0]).toContain('/api/llm/connections')
  })

  it('omite apiKey y baseUrl vacíos al crear, porque el server los rechaza', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(connectionRow, 201))
    const service = createHttpSettingsService({ fetchImpl })

    await service.createConnection({
      label: 'OpenAI',
      provider: 'openai',
      apiKey: 'sk-1234',
      baseUrl: '',
    })

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string)
    expect(body).toEqual({ label: 'OpenAI', provider: 'openai', apiKey: 'sk-1234' })
    expect('baseUrl' in body).toBe(false)
  })

  it('omite la apiKey vacía al actualizar, para no borrar la existente', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(connectionRow))
    const service = createHttpSettingsService({ fetchImpl })

    await service.updateConnection('conn-1', {
      label: 'Renombrada',
      provider: 'openai',
      apiKey: '',
      baseUrl: '',
    })

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string)
    expect(body).toEqual({ label: 'Renombrada' })
  })

  it('devuelve el resultado de la prueba tal cual', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false, error: 'El proveedor rechazó la credencial.' }))
    const service = createHttpSettingsService({ fetchImpl })

    const result = await service.testConnection('conn-1')

    expect(result).toEqual({ ok: false, error: 'El proveedor rechazó la credencial.' })
    expect(fetchImpl.mock.calls[0][0]).toContain('/api/llm/connections/conn-1/test')
  })

  it('completa las asignaciones con la etiqueta de la interfaz', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { agentId: 'orchestrator', connectionId: 'conn-1', model: 'gpt-5' },
        { agentId: 'calculation', connectionId: null, model: '' },
        { agentId: 'writer', connectionId: null, model: '' },
        { agentId: 'curator', connectionId: null, model: '' },
      ]),
    )
    const service = createHttpSettingsService({ fetchImpl })

    const result = await service.listAgentAssignments()

    expect(result[0]).toEqual({
      agentId: 'orchestrator',
      label: 'Orquestador',
      connectionId: 'conn-1',
      model: 'gpt-5',
    })
    expect(result.map((a) => a.label)).toEqual(['Orquestador', 'Cálculo', 'Escritura', 'Curador'])
  })

  it('lanza un error cuando el server responde con fallo', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'Not Found' }, 404))
    const service = createHttpSettingsService({ fetchImpl })

    await expect(service.deleteConnection('conn-x')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/client && npx vitest run src/features/settings/services/http-settings-service.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir `http-settings-service.ts`**

Se usa `fetch` con rutas explícitas y no el cliente `rpc` tipado: `rpc` es útil cuando el llamador consume la respuesta directo, pero aquí toda respuesta se adapta a los tipos de `SettingsService`, y un `fetch` inyectable es lo que hace testeable el servicio sin red. Las rutas van al mismo origen, que el proxy de Vite reenvía al server.

```ts
import { authClient } from '../../auth/services/auth-client'
import {
  AGENT_LABELS,
  AGENT_ORDER,
  type AgentAssignment,
  type AgentAssignmentInput,
  type AgentId,
  type ConnectionInput,
  type ConnectionTestResult,
  type LlmConnection,
  type UserProfile,
} from '../model/settings-types'
import type { SettingsService } from './settings-service'

type Options = { fetchImpl?: typeof fetch }

// El server valida apiKey con .min(1) y baseUrl con z.url(); mandar '' sería
// un 400. El formulario usa cadenas vacías para "sin valor".
function omitEmpty(input: ConnectionInput): Record<string, string> {
  const body: Record<string, string> = {
    label: input.label.trim(),
    provider: input.provider,
  }
  const apiKey = input.apiKey.trim()
  const baseUrl = input.baseUrl.trim()
  if (apiKey) body.apiKey = apiKey
  if (baseUrl) body.baseUrl = baseUrl
  return body
}

export function createHttpSettingsService(options: Options = {}): SettingsService {
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
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    async getProfile(): Promise<UserProfile> {
      const { data } = await authClient.getSession()
      return {
        name: data?.user.name ?? '',
        email: data?.user.email ?? '',
        avatarUrl: data?.user.image ?? null,
      }
    },

    async updateProfile(input) {
      await authClient.updateUser({ name: input.name.trim(), image: input.avatarUrl })
      return {
        name: input.name.trim(),
        email: (await authClient.getSession()).data?.user.email ?? '',
        avatarUrl: input.avatarUrl,
      }
    },

    async listConnections() {
      return request<LlmConnection[]>('/api/llm/connections')
    },

    async createConnection(input) {
      return request<LlmConnection>('/api/llm/connections', {
        method: 'POST',
        body: JSON.stringify(omitEmpty(input)),
      })
    },

    async updateConnection(id, input) {
      // provider no es actualizable: cambiarlo invalidaría la credencial guardada
      const { provider: _provider, ...body } = omitEmpty(input)
      return request<LlmConnection>(`/api/llm/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
    },

    async deleteConnection(id) {
      await request<{ deleted: string }>(`/api/llm/connections/${id}`, { method: 'DELETE' })
    },

    async testConnection(id): Promise<ConnectionTestResult> {
      return request<ConnectionTestResult>(`/api/llm/connections/${id}/test`, {
        method: 'POST',
      })
    },

    async listAgentAssignments(): Promise<AgentAssignment[]> {
      const rows = await request<
        { agentId: AgentId; connectionId: string | null; model: string }[]
      >('/api/llm/assignments')
      const byAgent = new Map(rows.map((row) => [row.agentId, row]))
      return AGENT_ORDER.map((agentId) => {
        const row = byAgent.get(agentId)
        return {
          agentId,
          label: AGENT_LABELS[agentId],
          connectionId: row?.connectionId ?? null,
          model: row?.model ?? '',
        }
      })
    },

    async updateAgentAssignment(agentId: AgentId, input: AgentAssignmentInput) {
      const row = await request<{ agentId: AgentId; connectionId: string | null; model: string }>(
        `/api/llm/assignments/${agentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ connectionId: input.connectionId, model: input.model }),
        },
      )
      return { ...row, label: AGENT_LABELS[agentId] }
    },
  }
}

export const httpSettingsService = createHttpSettingsService()
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `cd project/apps/client && npx vitest run src/features/settings/services/http-settings-service.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add project/apps/client/src/features/settings/services/http-settings-service.ts project/apps/client/src/features/settings/services/http-settings-service.test.ts
git commit -m "feat(client): implementacion HTTP de SettingsService"
```

---

### Task 12: Badge honesto y botón de prueba

**Files:**
- Modify: `project/apps/client/src/features/settings/components/ModelSettingsScreen.tsx`
- Modify: `project/apps/client/src/features/settings/components/ModelSettingsScreen.test.tsx` (agregar)
- Modify: `project/apps/client/src/features/settings/components/ModelSettingsScreen.module.css` (agregar)

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `ModelSettingsScreen.test.tsx`. Revisar primero cómo construye el archivo su servicio de prueba y seguir ese patrón; lo que sigue asume un mock creado con `createMockSettingsService()`.

```ts
it('muestra "Sin probar" cuando la conexión nunca se ha probado', async () => {
  const service = createMockSettingsService()
  service.listConnections = async () => [
    { ...connectionsFixture[0], lastTestStatus: null, lastTestedAt: null },
  ]

  render(<ModelSettingsScreen service={service} />, { wrapper: MemoryRouter })

  expect(await screen.findByText('Sin probar')).toBeInTheDocument()
})

it('muestra el fallo cuando la última prueba falló', async () => {
  const service = createMockSettingsService()
  service.listConnections = async () => [
    { ...connectionsFixture[0], lastTestStatus: 'failed', lastTestedAt: '2026-07-29T10:00:00.000Z' },
  ]

  render(<ModelSettingsScreen service={service} />, { wrapper: MemoryRouter })

  expect(await screen.findByText('Falló')).toBeInTheDocument()
})

it('al pulsar Probar refleja el resultado del servicio', async () => {
  const user = userEvent.setup()
  const service = createMockSettingsService()
  service.listConnections = async () => [
    { ...connectionsFixture[0], lastTestStatus: null, lastTestedAt: null },
  ]
  service.testConnection = async () => ({ ok: false, error: 'El proveedor rechazó la credencial.' })

  render(<ModelSettingsScreen service={service} />, { wrapper: MemoryRouter })

  await user.click(await screen.findByRole('button', { name: /probar openai/i }))

  expect(await screen.findByText('El proveedor rechazó la credencial.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd project/apps/client && npx vitest run src/features/settings/components/ModelSettingsScreen.test.tsx`
Expected: FAIL — no existe el texto "Sin probar" ni el botón "Probar".

- [ ] **Step 3: Agregar el estado de prueba al componente**

En `ModelSettingsScreen.tsx`, agregar el estado junto a los demás `useState` (después de la línea de `retryKey`):

```tsx
  const [testing, setTesting] = useState<Set<string>>(new Set())
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
```

Agregar la función junto a `remove()`:

```tsx
  async function test(connectionId: string) {
    setTesting((current) => new Set([...current, connectionId]))
    setTestErrors((current) => {
      const next = { ...current }
      delete next[connectionId]
      return next
    })
    try {
      const result = await service.testConnection(connectionId)
      if (!result.ok) {
        setTestErrors((current) => ({ ...current, [connectionId]: result.error }))
      }
      await load()
    } catch {
      setTestErrors((current) => ({
        ...current,
        [connectionId]: 'No pudimos probar la conexión. Inténtalo de nuevo.',
      }))
    } finally {
      setTesting((current) => {
        const next = new Set(current)
        next.delete(connectionId)
        return next
      })
    }
  }
```

Reemplazar el badge hardcodeado de la línea 152:

```tsx
                  <span className={styles.connectedStatus}><i aria-hidden="true" />Conectado</span>
```

por:

```tsx
                  <span
                    className={
                      item.lastTestStatus === 'ok'
                        ? styles.connectedStatus
                        : item.lastTestStatus === 'failed'
                          ? styles.failedStatus
                          : styles.untestedStatus
                    }
                  >
                    <i aria-hidden="true" />
                    {item.lastTestStatus === 'ok'
                      ? 'Conectado'
                      : item.lastTestStatus === 'failed'
                        ? 'Falló'
                        : 'Sin probar'}
                  </span>
```

Agregar el botón dentro de `rowActions`, antes del de Editar:

```tsx
                    <button
                      aria-label={`Probar ${item.label}`}
                      disabled={testing.has(item.id)}
                      onClick={() => void test(item.id)}
                      type="button"
                    >
                      {testing.has(item.id) ? 'Probando…' : 'Probar'}
                    </button>
```

Y el mensaje de error, justo después del `</div>` que cierra `rowActions` y antes de `</li>`:

```tsx
                  {testErrors[item.id] ? (
                    <p className={styles.testError} role="alert">{testErrors[item.id]}</p>
                  ) : null}
```

- [ ] **Step 4: Agregar los estilos**

Al final de `ModelSettingsScreen.module.css`, copiando la forma de `.connectedStatus` que ya existe en el archivo:

```css
.failedStatus,
.untestedStatus {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
}

.failedStatus i {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #c0392b;
}

.untestedStatus i {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #9aa0a6;
}

.testError {
  grid-column: 1 / -1;
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: #c0392b;
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `cd project/apps/client && npx vitest run src/features/settings/components/ModelSettingsScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add project/apps/client/src/features/settings/components/
git commit -m "feat(client): estado real de conexion en lugar del badge fijo"
```

---

### Task 13: Inyectar el servicio real

**Files:**
- Modify: `project/apps/client/src/App.tsx`

- [ ] **Step 1: Cambiar el import**

Reemplazar la línea 10:

```tsx
import { mockSettingsService } from './features/settings/services/mock-settings-service'
```

por:

```tsx
import { httpSettingsService } from './features/settings/services/http-settings-service'
```

- [ ] **Step 2: Cambiar las dos inyecciones**

En las rutas `/settings/profile` y `/settings/models`, sustituir `service={mockSettingsService}` por `service={httpSettingsService}`.

`mockHomeService` y `workspaceService` se quedan como están: no son de esta rebanada.

- [ ] **Step 3: Verificar tipos, lint y tests**

Run: `cd project/apps/client && npm run build && npm run lint && npm test`
Expected: PASS en los tres. `npm run build` corre `prebuild`, que regenera los tipos del server.

- [ ] **Step 4: Commit**

```bash
git add project/apps/client/src/App.tsx
git commit -m "feat(client): conectar la pantalla de modelos al server real"
```

---

## Fase D — Verificación de punta a punta

### Task 14: Prueba `live_llm` del puente completo

**Files:**
- Create: `project/apps/agents/tests/test_llm_live.py`

Esta es la evidencia de que el orquestador recibe la configuración del usuario correcto. El marcador `live_llm` ya está declarado en `pyproject.toml`.

- [ ] **Step 1: Escribir la prueba**

```python
"""Prueba de integración real: agents resuelve la configuración de LLM de un
usuario contra el server y extrae un circuit_spec de lenguaje natural.

Se salta salvo que estén configuradas SERVER_BASE_URL, AGENTS_SERVICE_TOKEN y
LIVE_LLM_USER_ID, y requiere que ese usuario tenga una conexión con credencial
válida asignada al agente 'orchestrator'.

    SERVER_BASE_URL=http://localhost:3001 \
    AGENTS_SERVICE_TOKEN=<token> \
    LIVE_LLM_USER_ID=<id-del-usuario> \
    uv run pytest tests/test_llm_live.py -m live_llm -v
"""

import os

import pytest

from agents.llm.factory import build_chat_model
from agents.llm.settings_client import fetch_agent_llm
from agents.orquestador.node import orquestador_node

pytestmark = pytest.mark.live_llm

_REQUIRED = ("SERVER_BASE_URL", "AGENTS_SERVICE_TOKEN", "LIVE_LLM_USER_ID")

skip_unless_configured = pytest.mark.skipif(
    not all(os.environ.get(name) for name in _REQUIRED),
    reason=f"requiere {', '.join(_REQUIRED)}",
)


@skip_unless_configured
def test_resuelve_la_configuracion_del_usuario_desde_el_server():
    user_id = os.environ["LIVE_LLM_USER_ID"]

    config = fetch_agent_llm("orchestrator", user_id)

    assert config.provider in {"anthropic", "openai", "google", "openai_compatible"}
    assert config.model, "el modelo asignado al orquestador no puede venir vacío"
    if config.provider != "openai_compatible":
        assert config.api_key, "la conexión asignada debe traer API key"


@skip_unless_configured
def test_construye_el_chat_model_con_esa_configuracion():
    config = fetch_agent_llm("orchestrator", os.environ["LIVE_LLM_USER_ID"])
    assert build_chat_model(config) is not None


@skip_unless_configured
def test_el_orquestador_extrae_un_circuit_spec_de_lenguaje_natural():
    result = orquestador_node(
        {"request_text": "un divisor de voltaje que baje 12 V a 5 V"},
        {"configurable": {"user_id": os.environ["LIVE_LLM_USER_ID"]}},
    )

    assert result.get("verdict") is None, f"el orquestador rechazó: {result.get('verdict')}"
    assert result["pending_blocks"], "no se produjo ningún sub-bloque"
    assert result["circuit_spec"]["blocks"][0]["type"] == "voltage_divider"


@skip_unless_configured
def test_un_usuario_sin_configuracion_es_rechazado_sin_reventar():
    result = orquestador_node(
        {"request_text": "un divisor de voltaje que baje 12 V a 5 V"},
        {"configurable": {"user_id": "usuario-que-no-existe-00000000"}},
    )

    assert result["verdict"]["status"] == "rejected"
    assert "llm_settings_unavailable" in result["verdict"]["reason"]
```

- [ ] **Step 2: Verificar que se salta limpiamente sin configuración**

Run: `cd project/apps/agents && uv run pytest tests/test_llm_live.py -v`
Expected: 4 skipped. Un fallo aquí significa que la prueba tiene un error de importación, no de configuración.

- [ ] **Step 3: Preparar el entorno y correrla de verdad**

Pedir al usuario que:
1. Levante el server: `cd project/apps/server && bun run dev`
2. Levante el client: `cd project/apps/client && npm run dev`
3. Inicie sesión, cree una conexión con una API key real, pulse **Probar** y confirme que el badge dice **Conectado**.
4. Asigne esa conexión y un modelo al **Orquestador**.
5. Comparta su `userId` (visible en la tabla `user`, o vía `GET /api/auth/me`).

Luego:

```bash
cd project/apps/agents && SERVER_BASE_URL=http://localhost:3001 AGENTS_SERVICE_TOKEN=<token> LIVE_LLM_USER_ID=<id> uv run pytest tests/test_llm_live.py -m live_llm -v
```

Expected: 4 passed.

Este paso es la validación real de la rebanada. Si falla, no marcar la tarea como completa: diagnosticar con el mensaje concreto del `verdict`, que ahora distingue entre falta de `user_id`, falta de configuración y server inalcanzable.

- [ ] **Step 4: Commit**

```bash
git add project/apps/agents/tests/test_llm_live.py
git commit -m "test(agents): prueba live del puente completo de configuracion de LLM"
```

---

### Task 15: Actualizar la documentación desfasada

**Files:**
- Modify: `CLAUDE.md`
- Modify: `project/apps/agents/.env.example`

- [ ] **Step 1: Corregir `CLAUDE.md`**

Tres afirmaciones quedaron falsas y confunden a quien llegue después:

1. En la sección del client, dice que es la plantilla de Vite sin modificar y que no está conectado al server. Reemplazar ese párrafo por:

```markdown
The client is a React/TypeScript app with feature folders under `src/features/`
(`auth`, `home`, `settings`, `workspace`). It talks to the server through the Vite
proxy (`/api` → `http://localhost:3001`) and a typed Hono RPC client in
`src/lib/rpc.ts`, which imports `AppType` from the server — run
`bun run --cwd ../server build:types` after changing server routes. `settings` is
wired to the real server; `workspace` still runs on a mock service.
```

2. Donde dice que el client no define script de tests, corregir: sí lo tiene, `npm test` corre `vitest run` (y `npm run test:watch`).

3. En la descripción del módulo `llm`, sustituir "un catálogo de configuraciones LLM (…) con a lo más una activa" por la forma nueva:

```markdown
- `llm` — LLM credentials split in two tables: `llm_connection` (label, provider,
  encrypted API key, baseUrl, last test result) and `agent_llm_assignment`
  (`agentId` → connection + model). Admin routes under `/api/llm/connections` and
  `/api/llm/assignments` (session auth), plus `/api/internal/llm/agent/:agentId?userId=`
  (service-token auth) consumed by agents. There is no "active config" anymore.
```

4. En la sección de agents, corregir la mención a `GET /api/internal/llm/active` por `GET /api/internal/llm/agent/:agentId?userId=`, y añadir que el `user_id` de la corrida viaja en `config.configurable.user_id`.

- [ ] **Step 2: Documentar la variable nueva de la prueba live**

Agregar al final de `project/apps/agents/.env.example`:

```bash
# Solo para tests: usuario contra el que corre la prueba live del LLM.
# uv run pytest tests/test_llm_live.py -m live_llm
LIVE_LLM_USER_ID=
```

- [ ] **Step 3: Correr las tres suites una última vez**

```bash
cd project/apps/server && RUN_DB_TESTS=1 TEST_USER_ID=<id-real> bun test && bun run typecheck
```
```bash
cd project/apps/client && npm test && npm run lint && npm run build
```
```bash
cd project/apps/agents && uv run pytest
```

Expected: PASS en todo. Reportar el resultado real; si algo falla, decirlo con la salida en vez de darlo por bueno.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md project/apps/agents/.env.example
git commit -m "docs: actualizar CLAUDE.md al estado real de client y modulo llm"
```

---

## Criterio de terminado

Del spec, verificado en la Task 14 Step 3 salvo donde se indica:

1. El usuario inicia sesión, crea una conexión con su API key y la ve listada sin que la llave aparezca en ninguna respuesta *(Task 2 lo cubre con test; Task 14 lo confirma a mano)*.
2. Pulsa "Probar" y el indicador refleja el resultado real del proveedor, y sigue reflejándolo tras recargar.
3. Asigna esa conexión y un modelo al orquestador.
4. La prueba `live_llm` resuelve esa configuración para ese usuario y extrae un `circuit_spec`.
5. La suite completa pasa en las tres apps *(Task 15 Step 3)*.

## Siguiente iteración

Fuera de este plan, en orden:

1. **Migrar al modelo de empuje**: el server resuelve las configuraciones y las inyecta al invocar el grafo; agents deja de llamar de vuelta y queda sin estado, como plantea la tesina.
2. Entrypoint HTTP en agents, que hoy es solo una librería.
3. Módulo de proyectos y conversaciones en el server, más `HttpWorkspaceService` en el client.
4. Especializar cálculo y curador con LLM. Hasta entonces sus asignaciones se guardan pero nadie las lee.
