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
