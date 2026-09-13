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

  for (const message of messages) {
    const roleLabel = message.role === "user" ? "Usuario" : "Asistente";
    parts.push(`${roleLabel}: ${message.content}`);
  }

  if (lastSpec !== null && lastSpec !== undefined) {
    parts.push(
      `Especificación resuelta en la última corrida:\n${JSON.stringify(lastSpec, null, 2)}`,
    );
  }

  parts.push(`Nueva instrucción: ${newText}`);

  return parts.join("\n\n");
}
