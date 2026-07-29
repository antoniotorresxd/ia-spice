import { and, eq } from "drizzle-orm";

import { db } from "@/db";

import { decryptApiKey, encryptApiKey } from "./llm.crypto";
import { agentLlmAssignment, AGENT_IDS, llmConnection, type AgentId, type TestStatus } from "./llm.model";

import type {
  CreateConnectionInput,
  UpdateAssignmentInput,
  UpdateConnectionInput,
} from "./llm.schemas";

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

// Única función que descifra una key para alimentar al endpoint interno de
// agents. Devuelve null (→ 404) cuando el agente no tiene asignación, cuando
// no tiene conexión, o cuando la conexión carece de key y su provider la exige.
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
