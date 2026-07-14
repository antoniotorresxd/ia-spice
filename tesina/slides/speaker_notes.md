# Guion de exposición — 20 minutos

## Slide 1 — Portada institucional
Tiempo: 0:30
Idea central: Presentar tema, institución e integrantes.
Guion sugerido: Presentamos una tesina sobre un ecosistema multiagente para generar y validar circuitos analógicos CA/CD usando LLM, aprendizaje por refuerzo y simulación ngspice.

## Slide 2 — Ruta de la exposición
Tiempo: 0:45
Idea central: Explicar el recorrido ampliado.
Guion sugerido: La exposición irá del problema al marco conceptual, estado del arte, solución, construcción y cierre técnico.

## Slide 3 — Marco teórico: base tecnológica
Tiempo: 1:15
Idea central: Mostrar los conceptos y tecnologías sin texto largo.
Guion sugerido: Esta lámina resume el soporte técnico: LLM para interpretar, LangGraph para orquestar agentes, Python y PySpice para construir la simulación, ngspice como árbitro físico, PostgreSQL como estado, Docker como despliegue, Better Auth como acceso y RL como decisión del curador.

## Slide 4 — Problema técnico
Tiempo: 1:15
Idea central: Un LLM por sí solo no valida físicamente.
Guion sugerido: El diseño analógico es iterativo. Un LLM puede proponer, pero no comprueba leyes físicas ni convergencia. Por eso hace falta una señal externa de validación.

## Slide 5 — Estado del arte: trabajos revisados
Tiempo: 1:45
Idea central: Ubicar antecedentes antes de hablar de la brecha.
Guion sugerido: Los trabajos revisados aportan piezas importantes: generación con código, multiagentes, memoria, validación por reglas y benchmarks. La pregunta es qué combinación aún no aparece integrada.

## Slide 6 — Brecha detectada
Tiempo: 1:30
Idea central: Explicar el espacio que ocupa el proyecto.
Guion sugerido: La brecha está en unir componentes comerciales con simulación SPICE dentro del lazo de diseño y no solo como prueba externa.

## Slide 7 — Idea central de la solución
Tiempo: 1:30
Idea central: Mostrar el ciclo completo de generación, simulación y decisión.
Guion sugerido: El sistema transforma lenguaje natural en netlist, simula, mide y usa un curador para aceptar o ajustar.

## Slide 8 — Objetivo técnico resumido
Tiempo: 0:45
Idea central: Reducir el objetivo a cuatro capacidades.
Guion sugerido: Interpretar especificación, calcular componentes, simular y ajustar son las capacidades que organizan el sistema.

## Slide 9 — Alcance de la solución
Tiempo: 1:00
Idea central: Delimitar qué sí y qué no contempla.
Guion sugerido: El alcance se limita a circuitos CA/CD con componentes comerciales y modelo SPICE; no incluye PCB ni síntesis a nivel transistor.

## Slide 10 — Arquitectura general: vista completa
Tiempo: 1:00
Idea central: Presentar cliente, servidor, persistencia y servicios externos.
Guion sugerido: El cliente gestiona acceso; el servidor aloja agentes; PostgreSQL guarda estado; LLM y ngspice aportan razonamiento y simulación.

## Slide 11 — Arquitectura general: recorrido de una solicitud
Tiempo: 1:00
Idea central: Seguir el movimiento de la información.
Guion sugerido: La solicitud entra por el cliente, llega al servidor, consulta LLM, simula, persiste estado y devuelve resultado.

## Slide 12 — Ecosistema de agentes: vista general
Tiempo: 1:15
Idea central: Presentar responsabilidades de agentes.
Guion sugerido: Orquestador, cálculo, escritura, shell, curador y checkpointer dividen responsabilidades para evitar un agente monolítico.

## Slide 13 — Ecosistema de agentes: explicación por zonas
Tiempo: 1:15
Idea central: Leer el sistema por coordinación, construcción y validación.
Guion sugerido: La validación es la zona central para la aportación, porque conecta shell, ngspice y curador.

## Slide 14 — Flujo de construcción del circuito
Tiempo: 1:45
Idea central: Conectar fases desde entrada hasta resultado.
Guion sugerido: La descripción se convierte en parámetros, sub-bloques, netlist, simulación, métricas y resultado con historial.

## Slide 15 — Lazo de validación y ajuste
Tiempo: 1:30
Idea central: Destacar la aportación principal.
Guion sugerido: El lazo permite que cada simulación alimente una decisión: aceptar, ajustar o rechazar, cerrando la corrección física.

## Slide 16 — Referencias clave
Tiempo: 0:45
Idea central: Nombrar fuentes principales sin convertirlo en bibliografía extensa.
Guion sugerido: Estas son las fuentes que sostienen el estado del arte, la simulación, la orquestación y el aprendizaje por refuerzo. La bibliografía completa queda en la tesina.

## Slide 17 — Cierre técnico
Tiempo: 1:15
Idea central: Sintetizar la contribución.
Guion sugerido: La aportación está en integrar LLM, agentes, simulación y curador dentro de un flujo que no solo genera, sino que valida y ajusta.
