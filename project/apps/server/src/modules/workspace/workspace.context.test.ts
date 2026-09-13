import { describe, expect, test } from "bun:test";

import { composeRequestText } from "./workspace.context";

const history = [
  { role: "user" as const, content: "un divisor de 12V a 5V" },
  { role: "assistant" as const, content: "all blocks within tolerance" },
];

describe("composeRequestText", () => {
  test("incluye la conversación completa, el spec previo y la instrucción nueva", () => {
    const spec = { blocks: [{ id: "block-1", type: "voltage_divider" }] };
    const result = composeRequestText(history, spec, "ahora a 3.3V");

    expect(result).toContain("Usuario: un divisor de 12V a 5V");
    expect(result).toContain("Asistente: all blocks within tolerance");
    expect(result).toContain('"type": "voltage_divider"');
    expect(result).toContain("Nueva instrucción: ahora a 3.3V");
  });

  test("respeta el orden: conversación, spec, instrucción nueva", () => {
    const result = composeRequestText(history, { blocks: [] }, "ahora a 3.3V");
    expect(result.indexOf("Usuario:")).toBeLessThan(result.indexOf("Asistente:"));
    expect(result.indexOf("Asistente:")).toBeLessThan(
      result.indexOf("Especificación resuelta"),
    );
    expect(result.indexOf("Especificación resuelta")).toBeLessThan(
      result.indexOf("Nueva instrucción"),
    );
  });

  test("conserva los mensajes iniciales del asistente en su orden original", () => {
    const result = composeRequestText(
      [
        { role: "assistant", content: "hola" },
        { role: "user", content: "un filtro RC" },
      ],
      null,
      "sube la frecuencia",
    );
    expect(result).toBe(
      "Asistente: hola\n\nUsuario: un filtro RC\n\nNueva instrucción: sube la frecuencia",
    );
  });

  test("conserva el diseño y la pregunta aclaratoria después de una charla irrelevante", () => {
    const result = composeRequestText(
      [
        { role: "user", content: "hola" },
        { role: "assistant", content: "hola, ¿en qué puedo ayudarte?" },
        { role: "user", content: "Diseña una fuente regulada de 5V" },
        { role: "assistant", content: "¿Cuál es el voltaje de entrada v_in?" },
        { role: "user", content: "5v" },
      ],
      null,
      "continúa",
    );

    expect(result).toBe(
      "Usuario: hola\n\n" +
        "Asistente: hola, ¿en qué puedo ayudarte?\n\n" +
        "Usuario: Diseña una fuente regulada de 5V\n\n" +
        "Asistente: ¿Cuál es el voltaje de entrada v_in?\n\n" +
        "Usuario: 5v\n\n" +
        "Nueva instrucción: continúa",
    );
  });

  test("sin spec previo omite ese bloque en lugar de escribir null", () => {
    const result = composeRequestText(history, null, "ahora a 3.3V");
    expect(result).not.toContain("Especificación resuelta");
    expect(result).not.toContain("null");
  });

  test("sin mensajes previos devuelve solo la instrucción nueva", () => {
    expect(composeRequestText([], null, "un divisor")).toBe("Nueva instrucción: un divisor");
  });

  test("sin spec definido omite el bloque de especificación", () => {
    expect(composeRequestText([], undefined, "un divisor")).toBe(
      "Nueva instrucción: un divisor",
    );
  });
});
