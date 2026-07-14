# Módulo de configuración de LLMs en el server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catálogo de configuraciones LLM en el server (keys cifradas, una sola activa) con CRUD autenticado y un endpoint interno para agents, según el spec `docs/superpowers/specs/2026-07-13-server-llm-config-design.md`.

**Architecture:** Nuevo módulo `src/modules/llm/` siguiendo el patrón de 3 archivos del server (`*.model.ts` / `*.services.ts` / `*.index.ts`) más `llm.schemas.ts` (Zod + serializador público) y `llm.crypto.ts` (AES-256-GCM). Tabla `llm_config` con índice único parcial que garantiza a nivel BD una sola fila activa. Endpoint interno `/api/internal/llm/active` autenticado con service token estático, único lugar donde la key sale descifrada.

**Tech Stack:** Bun, Hono (`OpenAPIHono`), Drizzle ORM + Neon Postgres, Zod v4, `node:crypto`, `bun test`.

**Working directory:** todos los comandos se corren desde `project/apps/server/`.

**Notas para el implementador:**
- El working tree del server puede tener cambios de otras sesiones en `app.ts`/`package.json`/etc. No los pises: agrega, no reescribas, y commitea solo los archivos que este plan toca.
- Tests: los que no necesitan BD corren siempre; los de integración contra Neon van gateados con `RUN_DB_TESTS=1` (`test.skipIf`). Nunca dejes keys reales en tests ni en `.env.example`.
- Zod v4: usar `z.url()` (no `z.string().url()`), y `z.treeifyError(err)` para serializar errores.

---

### Task 1: Variables de entorno y script de test

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `package.json` (agregar script `"test": "bun test"`)
- Modify: `.env` (local, no se commitea) y `.env.example` si existe

- [ ] **Step 1: Agregar las vars al schema Zod**

En `src/lib/env.ts`, dentro de `EnvSchema` agregar:

```ts
  LLM_SECRETS_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 bytes hex (64 hex chars)"),
  AGENTS_SERVICE_TOKEN: z.string().min(16),
```

- [ ] **Step 2: Generar valores locales y agregarlos a `.env`**

```bash
openssl rand -hex 32   # -> LLM_SECRETS_KEY
openssl rand -hex 24   # -> AGENTS_SERVICE_TOKEN
```

Agregar ambos a `.env` (y como placeholders vacíos a `.env.example` si el repo lo tiene). Verificar que `bun run dev` arranca (el proceso muere con mensaje claro si faltan).

- [ ] **Step 3: Agregar script de test**

En `package.json`, en `"scripts"`, agregar: `"test": "bun test"`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/env.ts package.json
git commit -m "feat(server): env vars LLM_SECRETS_KEY y AGENTS_SERVICE_TOKEN + script de test"
```

(No agregues `.env` al commit.)

---

### Task 2: Cifrado AES-256-GCM

**Files:**
- Create: `src/modules/llm/llm.crypto.ts`
- Test: `src/modules/llm/llm.crypto.test.ts`

- [ ] **Step 1: Escribir el test**

`src/modules/llm/llm.crypto.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { decryptApiKey, encryptApiKey } from "./llm.crypto";

const KEY_A = "a".repeat(64); // 32 bytes hex
const KEY_B = "b".repeat(64);

describe("llm.crypto", () => {
  test("roundtrip encrypt -> decrypt returns the original", () => {
    const stored = encryptApiKey("sk-super-secret-123", KEY_A);
    expect(stored).not.toContain("sk-super-secret-123");
    expect(stored.split(":")).toHaveLength(3);
    expect(decryptApiKey(stored, KEY_A)).toBe("sk-super-secret-123");
  });

  test("two encryptions of the same plaintext differ (random IV)", () => {
    expect(encryptApiKey("same", KEY_A)).not.toBe(encryptApiKey("same", KEY_A));
  });

  test("decrypting with the wrong master key throws", () => {
    const stored = encryptApiKey("sk-x", KEY_A);
    expect(() => decryptApiKey(stored, KEY_B)).toThrow();
  });

  test("decrypting a malformed blob throws", () => {
    expect(() => decryptApiKey("not-a-valid-blob", KEY_A)).toThrow();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test src/modules/llm/llm.crypto.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/modules/llm/llm.crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import env from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

// masterKeyHex es inyectable para tests; en producción siempre viene de env.
export function encryptApiKey(plain: string, masterKeyHex: string = env.LLM_SECRETS_KEY): string {
  const key = Buffer.from(masterKeyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

export function decryptApiKey(stored: string, masterKeyHex: string = env.LLM_SECRETS_KEY): string {
  const [ivB64, ciphertextB64, authTagB64] = stored.split(":");
  if (!ivB64 || !ciphertextB64 || !authTagB64) {
    throw new Error("malformed encrypted api key");
  }
  const key = Buffer.from(masterKeyHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Correr los tests**

Run: `bun test src/modules/llm/llm.crypto.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/llm/llm.crypto.ts src/modules/llm/llm.crypto.test.ts
git commit -m "feat(server): cifrado AES-256-GCM para API keys de LLM"
```

---

### Task 3: Tabla `llm_config` y migración

**Files:**
- Create: `src/modules/llm/llm.model.ts`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Crear el modelo**

`src/modules/llm/llm.model.ts`:

```ts
import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const LLM_PROVIDERS = ["anthropic", "openai", "google", "openai_compatible"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const llmConfig = pgTable(
  "llm_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text("label").notNull().unique(),
    provider: text("provider", { enum: LLM_PROVIDERS }).notNull(),
    model: text("model").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"),
    keyHint: text("key_hint"), // últimos 4 chars de la key, para la UI
    baseUrl: text("base_url"),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // la BD garantiza que nunca haya dos configuraciones activas
    uniqueIndex("llm_config_single_active_idx")
      .on(table.isActive)
      .where(sql`${table.isActive} = true`),
  ],
);
```

- [ ] **Step 2: Re-exportar en el agregador**

`src/db/schema.ts`:

```ts
export * from "../modules/auth/auth.model";
export * from "../modules/llm/llm.model";
```

- [ ] **Step 3: Generar y aplicar la migración**

```bash
bun run db:generate
bun run db:migrate
```

Expected: se crea un archivo de migración en `src/db/migrations/` con `CREATE TABLE "llm_config"` y el índice único parcial; migrate lo aplica a Neon sin error.

- [ ] **Step 4: Commit**

```bash
git add src/modules/llm/llm.model.ts src/db/schema.ts src/db/migrations
git commit -m "feat(server): tabla llm_config con unica configuracion activa"
```

---

### Task 4: Schemas Zod y serializador público

**Files:**
- Create: `src/modules/llm/llm.schemas.ts`
- Test: `src/modules/llm/llm.schemas.test.ts`

- [ ] **Step 1: Escribir los tests**

`src/modules/llm/llm.schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  createLlmConfigSchema,
  toPublicLlmConfig,
  updateLlmConfigSchema,
} from "./llm.schemas";

describe("createLlmConfigSchema", () => {
  test("accepts anthropic with apiKey", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Claude prod",
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-ant-xxx",
    });
    expect(result.success).toBe(true);
  });

  test("rejects anthropic without apiKey", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Claude prod",
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
    expect(result.success).toBe(false);
  });

  test("accepts openai_compatible with baseUrl and no apiKey", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Ollama local",
      provider: "openai_compatible",
      model: "llama3.1:8b",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(result.success).toBe(true);
  });

  test("rejects openai_compatible without baseUrl", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "Ollama local",
      provider: "openai_compatible",
      model: "llama3.1:8b",
    });
    expect(result.success).toBe(false);
  });

  test("rejects unknown provider", () => {
    const result = createLlmConfigSchema.safeParse({
      label: "x",
      provider: "nope",
      model: "y",
      apiKey: "z",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateLlmConfigSchema", () => {
  test("all fields optional", () => {
    expect(updateLlmConfigSchema.safeParse({}).success).toBe(true);
    expect(updateLlmConfigSchema.safeParse({ model: "gpt-4o" }).success).toBe(true);
  });
});

describe("toPublicLlmConfig", () => {
  const row = {
    id: "abc",
    label: "Claude prod",
    provider: "anthropic" as const,
    model: "claude-sonnet-5",
    apiKeyEncrypted: "iv:ct:tag",
    keyHint: "x123",
    baseUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  test("never exposes the encrypted key", () => {
    const pub = toPublicLlmConfig(row);
    expect(JSON.stringify(pub)).not.toContain("iv:ct:tag");
    expect((pub as Record<string, unknown>).apiKeyEncrypted).toBeUndefined();
  });

  test("exposes hasKey and keyHint instead", () => {
    const pub = toPublicLlmConfig(row);
    expect(pub.hasKey).toBe(true);
    expect(pub.keyHint).toBe("x123");
    expect(toPublicLlmConfig({ ...row, apiKeyEncrypted: null, keyHint: null }).hasKey).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test src/modules/llm/llm.schemas.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/modules/llm/llm.schemas.ts`:

```ts
import { z } from "zod";

import { LLM_PROVIDERS, type llmConfig } from "./llm.model";

export const providerSchema = z.enum(LLM_PROVIDERS);

export const createLlmConfigSchema = z
  .object({
    label: z.string().min(1),
    provider: providerSchema,
    model: z.string().min(1),
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

export type CreateLlmConfigInput = z.infer<typeof createLlmConfigSchema>;

export const updateLlmConfigSchema = z.object({
  label: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.url().nullable().optional(),
});

export type UpdateLlmConfigInput = z.infer<typeof updateLlmConfigSchema>;

type LlmConfigRow = typeof llmConfig.$inferSelect;

// vista pública: jamás incluye la key (ni cifrada ni en claro)
export function toPublicLlmConfig(row: LlmConfigRow) {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    isActive: row.isActive,
    hasKey: row.apiKeyEncrypted !== null,
    keyHint: row.keyHint,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 4: Correr los tests**

Run: `bun test src/modules/llm/llm.schemas.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/llm/llm.schemas.ts src/modules/llm/llm.schemas.test.ts
git commit -m "feat(server): schemas Zod y vista publica del catalogo LLM"
```

---

### Task 5: Servicios CRUD y activación

**Files:**
- Create: `src/modules/llm/llm.services.ts`
- Test: `src/modules/llm/llm.services.test.ts` (gateado con `RUN_DB_TESTS=1`)

- [ ] **Step 1: Escribir los tests (integración con BD, gateados)**

`src/modules/llm/llm.services.test.ts`:

```ts
import { afterAll, describe, expect, test } from "bun:test";

import {
  activateLlmConfig,
  createLlmConfig,
  deleteLlmConfig,
  getActiveLlmResolved,
  listLlmConfigs,
  updateLlmConfig,
} from "./llm.services";

// Integración real contra la BD (Neon). Correr con: RUN_DB_TESTS=1 bun test
const runDb = process.env.RUN_DB_TESTS === "1";
const t = test.skipIf(!runDb);

const createdIds: string[] = [];

afterAll(async () => {
  if (!runDb) return;
  for (const id of createdIds) {
    await deleteLlmConfig(id).catch(() => {});
  }
});

describe("llm.services (db)", () => {
  t("create/list/update/delete roundtrip", async () => {
    const created = await createLlmConfig({
      label: `test-anthropic-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-test-abcd1234",
    });
    createdIds.push(created.id);

    expect(created.apiKeyEncrypted).not.toBeNull();
    expect(created.apiKeyEncrypted).not.toContain("sk-test");
    expect(created.keyHint).toBe("1234");

    const listed = await listLlmConfigs();
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const updated = await updateLlmConfig(created.id, { model: "claude-haiku-4-5" });
    expect(updated?.model).toBe("claude-haiku-4-5");
    // sin apiKey en el update, la key cifrada se conserva
    expect(updated?.apiKeyEncrypted).toBe(created.apiKeyEncrypted);
  });

  t("activate deactivates the previous active", async () => {
    const a = await createLlmConfig({
      label: `test-a-${Date.now()}`,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-aaaa",
    });
    const b = await createLlmConfig({
      label: `test-b-${Date.now()}`,
      provider: "openai_compatible",
      model: "llama3.1:8b",
      baseUrl: "http://localhost:11434/v1",
    });
    createdIds.push(a.id, b.id);

    await activateLlmConfig(a.id);
    await activateLlmConfig(b.id);

    const listed = await listLlmConfigs();
    const actives = listed.filter((r) => r.isActive && createdIds.includes(r.id));
    expect(actives).toHaveLength(1);
    expect(actives[0]!.id).toBe(b.id);
  });

  t("getActiveLlmResolved returns the contract shape with decrypted key", async () => {
    const a = await createLlmConfig({
      label: `test-resolved-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "sk-resolved-9999",
    });
    createdIds.push(a.id);
    await activateLlmConfig(a.id);

    const active = await getActiveLlmResolved();
    expect(active).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      api_key: "sk-resolved-9999",
      base_url: null,
    });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `RUN_DB_TESTS=1 bun test src/modules/llm/llm.services.test.ts`
Expected: FAIL — módulo inexistente. (Sin `RUN_DB_TESTS=1` todos se saltan; verifica ambos comportamientos.)

- [ ] **Step 3: Implementar**

`src/modules/llm/llm.services.ts`:

```ts
import { eq } from "drizzle-orm";

import { db } from "@/db";

import { decryptApiKey, encryptApiKey } from "./llm.crypto";
import { llmConfig } from "./llm.model";

import type { CreateLlmConfigInput, UpdateLlmConfigInput } from "./llm.schemas";

export async function listLlmConfigs() {
  return db.select().from(llmConfig).orderBy(llmConfig.createdAt);
}

export async function createLlmConfig(input: CreateLlmConfigInput) {
  const [row] = await db
    .insert(llmConfig)
    .values({
      label: input.label,
      provider: input.provider,
      model: input.model,
      apiKeyEncrypted: input.apiKey ? encryptApiKey(input.apiKey) : null,
      keyHint: input.apiKey ? input.apiKey.slice(-4) : null,
      baseUrl: input.baseUrl ?? null,
    })
    .returning();
  return row!;
}

export async function updateLlmConfig(id: string, input: UpdateLlmConfigInput) {
  const values: Partial<typeof llmConfig.$inferInsert> = {};
  if (input.label !== undefined) values.label = input.label;
  if (input.model !== undefined) values.model = input.model;
  if (input.baseUrl !== undefined) values.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) {
    values.apiKeyEncrypted = encryptApiKey(input.apiKey);
    values.keyHint = input.apiKey.slice(-4);
  }
  if (Object.keys(values).length === 0) {
    const [row] = await db.select().from(llmConfig).where(eq(llmConfig.id, id)).limit(1);
    return row ?? null;
  }
  const [row] = await db
    .update(llmConfig)
    .set(values)
    .where(eq(llmConfig.id, id))
    .returning();
  return row ?? null;
}

export async function deleteLlmConfig(id: string) {
  const [row] = await db.delete(llmConfig).where(eq(llmConfig.id, id)).returning();
  return row ?? null;
}

// El driver neon-http no soporta transacciones interactivas; se hacen dos
// updates secuenciales. El índice único parcial de la tabla garantiza que
// nunca queden dos activas aunque el proceso muera entre ambos updates
// (el estado intermedio posible es "ninguna activa", que es seguro).
export async function activateLlmConfig(id: string) {
  await db.update(llmConfig).set({ isActive: false }).where(eq(llmConfig.isActive, true));
  const [row] = await db
    .update(llmConfig)
    .set({ isActive: true })
    .where(eq(llmConfig.id, id))
    .returning();
  return row ?? null;
}

// Única función que descifra la key: alimenta el endpoint interno de agents.
export async function getActiveLlmResolved() {
  const [row] = await db
    .select()
    .from(llmConfig)
    .where(eq(llmConfig.isActive, true))
    .limit(1);
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    api_key: row.apiKeyEncrypted ? decryptApiKey(row.apiKeyEncrypted) : null,
    base_url: row.baseUrl,
  };
}
```

- [ ] **Step 4: Correr los tests**

Run: `RUN_DB_TESTS=1 bun test src/modules/llm/llm.services.test.ts`
Expected: PASS (3 tests, contra la BD real). Y `bun test src/modules/llm/llm.services.test.ts` (sin la var) los salta.

- [ ] **Step 5: Commit**

```bash
git add src/modules/llm/llm.services.ts src/modules/llm/llm.services.test.ts
git commit -m "feat(server): servicios CRUD y activacion unica del catalogo LLM"
```

---

### Task 6: Router de administración y montaje

**Files:**
- Create: `src/modules/llm/llm.index.ts`
- Modify: `src/app.ts` (solo agregar el router al encadenamiento existente)
- Test: `src/modules/llm/llm.routes.test.ts`

- [ ] **Step 1: Escribir los tests de rutas (sin sesión → 401; validación → 400)**

`src/modules/llm/llm.routes.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import app from "@/app";

describe("llm admin routes", () => {
  test("GET /api/llm without session -> 401", async () => {
    const res = await app.request("/api/llm");
    expect(res.status).toBe(401);
  });

  test("POST /api/llm without session -> 401", async () => {
    const res = await app.request("/api/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x", provider: "anthropic", model: "m", apiKey: "k" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/llm/:id/activate without session -> 401", async () => {
    const res = await app.request("/api/llm/some-id/activate", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test src/modules/llm/llm.routes.test.ts`
Expected: FAIL — hoy `/api/llm` no existe, responde 404 (el notFound), no 401.

- [ ] **Step 3: Implementar el router**

`src/modules/llm/llm.index.ts`:

```ts
import { z } from "zod";

import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/session";

import {
  createLlmConfigSchema,
  toPublicLlmConfig,
  updateLlmConfigSchema,
} from "./llm.schemas";
import {
  activateLlmConfig,
  createLlmConfig,
  deleteLlmConfig,
  listLlmConfigs,
  updateLlmConfig,
} from "./llm.services";

export const llmRouter = createRouter();

llmRouter.use("/api/llm", requireAuth);
llmRouter.use("/api/llm/*", requireAuth);

llmRouter.get("/api/llm", async (c) => {
  const rows = await listLlmConfigs();
  return c.json(rows.map(toPublicLlmConfig));
});

llmRouter.post("/api/llm", async (c) => {
  const parsed = createLlmConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: z.treeifyError(parsed.error) }, 400);
  }
  const row = await createLlmConfig(parsed.data);
  return c.json(toPublicLlmConfig(row), 201);
});

llmRouter.patch("/api/llm/:id", async (c) => {
  const parsed = updateLlmConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: z.treeifyError(parsed.error) }, 400);
  }
  const row = await updateLlmConfig(c.req.param("id"), parsed.data);
  if (!row) return c.json({ error: "Not Found" }, 404);
  return c.json(toPublicLlmConfig(row));
});

llmRouter.delete("/api/llm/:id", async (c) => {
  const row = await deleteLlmConfig(c.req.param("id"));
  if (!row) return c.json({ error: "Not Found" }, 404);
  return c.json({ deleted: row.id });
});

llmRouter.post("/api/llm/:id/activate", async (c) => {
  const row = await activateLlmConfig(c.req.param("id"));
  if (!row) return c.json({ error: "Not Found" }, 404);
  const catalog = await listLlmConfigs();
  return c.json({
    active: toPublicLlmConfig(row),
    catalog: catalog.map(toPublicLlmConfig),
  });
});
```

- [ ] **Step 4: Montar el router en `src/app.ts`**

`app.ts` puede tener cambios de otras sesiones — solo AGREGA el import y encadena el router donde está el existente, sin tocar lo demás. Con el `app.ts` actual quedaría:

```ts
import { llmRouter } from "@/modules/llm/llm.index";
// ...
const routes = app.route("/", authRouter).route("/", llmRouter);
```

- [ ] **Step 5: Correr los tests**

Run: `bun test src/modules/llm/llm.routes.test.ts`
Expected: PASS (3 tests — `requireAuth` responde 401 antes de tocar BD).

- [ ] **Step 6: Commit**

```bash
git add src/modules/llm/llm.index.ts src/modules/llm/llm.routes.test.ts src/app.ts
git commit -m "feat(server): rutas de administracion del catalogo LLM"
```

---

### Task 7: Endpoint interno para agents

**Files:**
- Modify: `src/modules/llm/llm.index.ts` (agregar la ruta interna)
- Modify: `src/modules/llm/llm.routes.test.ts` (agregar tests)

- [ ] **Step 1: Agregar los tests**

Al final de `src/modules/llm/llm.routes.test.ts`:

```ts
import env from "@/lib/env";

describe("internal llm endpoint", () => {
  test("401 without token", async () => {
    const res = await app.request("/api/internal/llm/active");
    expect(res.status).toBe(401);
  });

  test("401 with wrong token", async () => {
    const res = await app.request("/api/internal/llm/active", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  // Integración con BD: 404 sin activa / 200 con la shape del contrato.
  // Gateado igual que los tests de servicios.
  const runDb = process.env.RUN_DB_TESTS === "1";
  test.skipIf(!runDb)("200 or 404 with valid token (contract shape)", async () => {
    const res = await app.request("/api/internal/llm/active", {
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

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun test src/modules/llm/llm.routes.test.ts`
Expected: FAIL — la ruta interna no existe aún (404 en vez de 401).

- [ ] **Step 3: Implementar la ruta interna**

Agregar al final de `src/modules/llm/llm.index.ts` (después de las rutas admin; nota: NO lleva `requireAuth` — usa el service token):

```ts
import { timingSafeEqual } from "node:crypto";

import env from "@/lib/env";

import { getActiveLlmResolved } from "./llm.services";

function isValidServiceToken(header: string | undefined): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(env.AGENTS_SERVICE_TOKEN);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

llmRouter.get("/api/internal/llm/active", async (c) => {
  if (!isValidServiceToken(c.req.header("authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const active = await getActiveLlmResolved();
  if (!active) {
    return c.json({ error: "No active LLM configured" }, 404);
  }
  return c.json(active);
});
```

(Consolida los imports arriba del archivo: `timingSafeEqual`, `env` y `getActiveLlmResolved` son nuevos respecto a Task 6 — agrégalos junto a los imports existentes, no dupliques bloques de import a mitad del archivo.)

- [ ] **Step 4: Correr los tests**

Run: `bun test src/modules/llm/llm.routes.test.ts` y `RUN_DB_TESTS=1 bun test src/modules/llm/llm.routes.test.ts`
Expected: PASS en ambos modos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/llm/llm.index.ts src/modules/llm/llm.routes.test.ts
git commit -m "feat(server): endpoint interno /api/internal/llm/active con service token"
```

---

### Task 8: Verificación manual end-to-end y documentación

**Files:**
- Modify: `CLAUDE.md` (raíz del repo — sección del server)

- [ ] **Step 1: Verificación manual con el server corriendo**

Con `bun run dev` corriendo y una sesión iniciada (obtener cookie vía el flujo de auth, o usar el dashboard/Scalar en `/reference`), verificar el flujo completo:

```bash
TOKEN="<AGENTS_SERVICE_TOKEN de tu .env>"

# sin activa aún -> 404
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/internal/llm/active

# crear y activar (requiere cookie de sesión; -b cookie.txt tras login)
curl -s -b cookie.txt -X POST http://localhost:3001/api/llm \
  -H "content-type: application/json" \
  -d '{"label":"Ollama local","provider":"openai_compatible","model":"llama3.1:8b","baseUrl":"http://localhost:11434/v1"}'
curl -s -b cookie.txt -X POST http://localhost:3001/api/llm/<id>/activate

# ahora -> 200 con provider/model/api_key/base_url
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/internal/llm/active

# y el catálogo autenticado nunca muestra keys
curl -s -b cookie.txt http://localhost:3001/api/llm
```

Expected: la secuencia 404 → creación → activación → 200 con la shape del contrato, y ninguna respuesta de `/api/llm` contiene `apiKeyEncrypted` ni keys en claro.

- [ ] **Step 2: Correr la suite completa**

Run: `bun test` y `RUN_DB_TESTS=1 bun test`
Expected: PASS en ambos modos.

- [ ] **Step 3: Actualizar `CLAUDE.md`**

En la sección "Server (`project/apps/server`)" del `CLAUDE.md` raíz: agregar `bun test` a la lista de comandos (reemplazando la frase "No lint/test scripts are defined for the server"), y en la lista de env vars de `src/lib/env.ts` agregar `LLM_SECRETS_KEY` y `AGENTS_SERVICE_TOKEN`. En "Module pattern", mencionar que ahora existen dos módulos (`auth` y `llm`) y que `llm` expone el catálogo de LLMs (keys cifradas, una activa) más el endpoint interno `/api/internal/llm/active` para agents.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: modulo llm del server en CLAUDE.md"
```
