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
