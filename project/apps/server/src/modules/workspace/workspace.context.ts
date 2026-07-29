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
