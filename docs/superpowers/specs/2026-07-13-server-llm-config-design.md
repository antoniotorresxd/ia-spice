# Diseño: módulo de configuración de LLMs en el server (iteración 3, lado server)

Fecha: 2026-07-13

## Contexto

La iteración 2 dejó el pipeline de agentes completo y determinista
(`docs/superpowers/specs/2026-07-13-agents-full-pipeline-slice-design.md`). La
iteración 3 introduce el primer LLM real: el orquestador de agents convertirá
lenguaje natural en un `circuit_spec` estructurado. Para las pruebas de la
tesina se necesitan **muchos LLMs de varios providers**, intercambiables sin
tocar código ni redeployar.

Decisión de arquitectura: el **server centraliza toda la configuración de
LLMs** (catálogo de providers, keys, modelos) y expone al subsistema de agents
únicamente el LLM activo, ya resuelto. Agents nunca configura un LLM por su
cuenta ni conoce el catálogo completo.

Este documento cubre solo el lado server. El lado agents tiene su propio spec:
`2026-07-13-agents-llm-orquestador-design.md`. El contrato HTTP entre ambos
está definido idéntico en los dos documentos.

## Alcance de este corte

Un módulo `llm` en `project/apps/server` siguiendo el patrón de 3 archivos
existente (`*.model.ts`, `*.services.ts`, `*.index.ts`):

- Catálogo de configuraciones LLM en Postgres, con API keys **cifradas**.
- CRUD autenticado (better-auth `requireAuth`) para administrar el catálogo.
- Regla "solo una configuración activa a la vez", con endpoint de activación.
- Endpoint interno para agents, autenticado con un service token estático.

Explícitamente fuera de alcance:

- UI del cliente para administrar el catálogo (iteración futura).
- Invocar el pipeline de agents desde el server (no existe aún API HTTP en
  agents; ese contrato es de una iteración futura).
- Métricas de uso/costos por LLM, rate limiting, rotación de keys.
- Multi-tenancy: el catálogo es global, no por usuario/workspace.

## Providers soportados

| `provider` | Campos requeridos | Notas |
|---|---|---|
| `anthropic` | `model`, `apiKey` | |
| `openai` | `model`, `apiKey` | |
| `google` | `model`, `apiKey` | Gemini |
| `openai_compatible` | `model`, `baseUrl`; `apiKey` opcional | Ollama, LM Studio, vLLM, etc. |

## Modelo de datos (`llm.model.ts`)

Tabla `llm_config`:

- `id` — uuid/text pk (mismo estilo que las tablas de auth existentes).
- `label` — nombre legible único (ej. "Claude Sonnet prod", "Ollama local").
- `provider` — text con check/enum de los 4 valores.
- `model` — text (ej. `claude-sonnet-5`, `gpt-4o`, `gemini-2.0-flash`,
  `llama3.1:8b`).
- `apiKeyEncrypted` — text nullable (cifrado, nunca en claro en BD).
- `baseUrl` — text nullable (solo `openai_compatible` lo usa).
- `isActive` — boolean, default false. **Índice único parcial** sobre
  `isActive = true`: la BD garantiza que nunca haya dos activas.
- `createdAt` / `updatedAt` — timestamps, mismo estilo que `auth.model.ts`.

El archivo se llama `llm.model.ts`, con lo que `drizzle.config.ts` lo recoge
automáticamente; después de crearlo se corre `bun run db:generate` +
`bun run db:migrate`.

## Cifrado de keys (`llm.services.ts`)

- AES-256-GCM con una master key de 32 bytes en env: `LLM_SECRETS_KEY`
  (hex/base64), agregada al schema Zod de `src/lib/env.ts` (el proceso no
  arranca sin ella).
- Formato almacenado: `iv:ciphertext:authTag` (base64, separados por `:`).
- Se usa `node:crypto` (disponible en Bun); sin dependencias nuevas.
- `encryptApiKey(plain) -> string` y `decryptApiKey(stored) -> string`; el
  descifrado ocurre únicamente al servir el endpoint interno de agents.

## API (`llm.index.ts`)

Router montado en `/api/llm`, todas las rutas de administración con
`requireAuth`:

- `GET /api/llm` — lista el catálogo. Las keys **nunca** se devuelven: cada
  item incluye `hasKey: boolean` y `keyHint` (últimos 4 caracteres) en su
  lugar.
- `POST /api/llm` — crea una configuración. Valida con Zod según `provider`
  (ej. `openai_compatible` exige `baseUrl`; los otros tres exigen `apiKey`).
- `PATCH /api/llm/:id` — actualiza label/model/baseUrl/apiKey (si viene
  `apiKey`, se re-cifra; si no viene, se conserva).
- `DELETE /api/llm/:id` — elimina. Si era la activa, queda ninguna activa.
- `POST /api/llm/:id/activate` — transaccional: desactiva la activa actual y
  activa esta. Respuesta incluye el catálogo actualizado.

### Endpoint interno para agents

- `GET /api/internal/llm/active`
- Autenticación: header `Authorization: Bearer <AGENTS_SERVICE_TOKEN>`, un
  token estático compartido definido por env en ambos subsistemas (nuevo var
  `AGENTS_SERVICE_TOKEN` en el schema de env del server). Independiente de
  better-auth/sesiones.
- `200` con el LLM activo **resuelto** (key descifrada — este es el único
  lugar donde la key sale en claro; en despliegue el canal es HTTPS):

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-5",
  "api_key": "sk-ant-...",
  "base_url": null
}
```

- `api_key` puede ser `null` (caso `openai_compatible` sin key); `base_url`
  es `null` salvo para `openai_compatible`.
- `404` si no hay configuración activa.
- `401` si falta el token o no coincide.

Registrar `llmRouter` en el array de rutas de `src/app.ts`.

## Pruebas y manejo de errores

El server no tiene hoy script de test; este corte lo introduce con
`bun test` (runner nativo de Bun) y un script `"test"` en `package.json`.

- Cifrado: roundtrip encrypt→decrypt, y que descifrar un blob corrupto o con
  otra master key falle limpiamente.
- Servicios CRUD: crear/listar/actualizar/eliminar contra la BD (o el patrón
  de test de servicios que la implementación decida — si tocar Neon en tests
  no es viable, aislar la lógica pura y testear validación + cifrado + shape
  de respuestas, dejando el CRUD para verificación manual documentada).
- Regla de una activa: activar B teniendo A activa deja solo B activa.
- Endpoint interno: 401 sin token, 404 sin activa, 200 con la shape exacta
  del contrato (snake_case: `provider`, `model`, `api_key`, `base_url`).
- Seguridad de lectura: `GET /api/llm` jamás incluye `apiKeyEncrypted` ni la
  key en claro en ninguna respuesta.
- Validación por provider: crear `openai_compatible` sin `baseUrl` → 400;
  crear `anthropic` sin `apiKey` → 400.

## Siguientes cortes (fuera de alcance aquí, para referencia futura)

1. **Invocación del pipeline desde el server**: endpoint en agents (o cola de
   trabajos) para que el server dispare corridas de generación de circuitos
   con el texto del usuario, y persista resultados/veredictos por workspace.
2. **UI de administración en el cliente**: pantalla para el catálogo de LLMs
   (crear, activar, probar conexión) consumiendo `/api/llm`.
3. **Endpoint de "probar conexión"**: `POST /api/llm/:id/test` que haga una
   llamada mínima al provider para validar key/modelo antes de activar.
4. **Métricas de uso por LLM** (tokens, latencia, costo estimado) para la
   evaluación empírica de la tesina (comparar providers en los 20 circuitos
   de prueba).
5. **Scoping por workspace/usuario** si el catálogo global se queda corto.
