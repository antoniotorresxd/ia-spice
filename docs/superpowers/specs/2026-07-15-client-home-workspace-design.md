# Diseño: home operativo del Ecosistema Multiagente

Fecha: 2026-07-15

## Contexto

El cliente ya cuenta con una experiencia de autenticación oscura y precisa,
inspirada en productos como Linear. Después de iniciar sesión, sin embargo, la
aplicación solo muestra una tarjeta temporal de sesión activa. El servidor Hono
todavía no expone proyectos, conversaciones, ejecuciones, archivos ni métricas
de consumo, y el proyecto Python de agentes aún no está conectado al servidor.

Este corte define e implementa el primer home autenticado del producto con
datos de demostración. La interfaz debe validar el modelo de interacción y sus
estados antes de conectar contratos reales mediante Hono RPC.

## Objetivo

Construir un workspace operativo que permita al usuario:

- conocer el uso reciente del sistema;
- iniciar solicitudes mediante lenguaje natural sin fricción;
- revisar proyectos, conversaciones y ejecuciones recientes;
- entender visualmente el progreso de una ejecución;
- localizar los archivos generados;
- interactuar con un asistente compacto sin convertir el producto en una
  pantalla de chat dominante.

## Alcance del corte

### Incluido

- Sustitución de la tarjeta de sesión activa por el home autenticado.
- Navegación principal y composición responsiva tipo Linear.
- Resumen operativo con tokens, costo estimado, ejecuciones, tiempo de proceso
  y archivos generados.
- Actividad reciente representada como timeline operacional.
- Proyectos, conversaciones y archivos recientes.
- Entrada compacta de lenguaje natural.
- Panel de asistente minimizable, compacto y expandible.
- Estados de carga, vacío, error, ejecución activa y ejecución completada.
- Fixtures realistas y un servicio mock tipado.
- Interacciones locales y pruebas de componentes.

### Fuera de alcance

- Persistencia real de proyectos, conversaciones o archivos.
- Endpoints nuevos en el servidor Hono.
- Integración entre el servidor Hono y el proyecto Python de agentes.
- Streaming de progreso o respuestas.
- Cálculo real de tokens o costo por modelo.
- Descarga, preview o eliminación real de archivos.
- Llamadas RPC desde el home.

## Identidad y dirección visual

La identidad visible será **Ecosistema Multiagente**. El término SPICE solo se
usará cuando describa una tecnología, una simulación o un tipo de archivo; no
será el nombre del workspace.

El home reutiliza los tokens del login: fondo grafito, superficies oscuras,
bordes de bajo contraste, blanco suave, menta para actividad válida y violeta
para decisiones o comparaciones. Las auroras del login no dominarán el entorno
autenticado. El workspace será más sobrio, denso y operativo.

La calidad visual se apoya en:

- alineación consistente entre navegación, contenido y metadatos;
- ritmo vertical compacto pero legible;
- divisores y superficies discretas en lugar de muchas tarjetas grandes;
- radios contenidos y sombras reservadas para elementos flotantes;
- jerarquía tipográfica antes que decoración;
- color funcional, nunca como único indicador de estado.

## Modelo de información

La jerarquía persistente objetivo es:

```text
Proyecto
  └─ Conversaciones
       └─ Ejecuciones
            └─ Archivos generados
```

Un proyecto agrupa trabajo relacionado. Puede contener varias conversaciones;
cada conversación conserva una secuencia de ejecuciones y cada ejecución puede
producir cero o más archivos.

Una solicitud enviada desde el home crea inmediatamente una conversación
temporal. El usuario puede asociarla después a un proyecto existente o crear un
proyecto nuevo. La elección de proyecto no bloquea el primer mensaje.

## Estructura general

El home tiene tres regiones estables y un panel auxiliar:

### Sidebar izquierda

Contiene:

- Inicio.
- Nueva solicitud.
- Proyectos.
- Conversaciones.
- Archivos.
- Ejecuciones.
- Proyectos y conversaciones recientes.
- Acceso al perfil y cierre de sesión.

### Área central

En reposo presenta el resumen operativo, actividad reciente y el compositor de
lenguaje natural. Cuando existe una ejecución seleccionada, el timeline
operacional ocupa el centro sin provocar un cambio brusco de contexto.

### Panel contextual derecho

Muestra estado, proyecto, conversación, fechas, consumo relacionado y archivos
del elemento seleccionado. Puede ocultarse cuando no aporta información y se
convierte en drawer en pantallas pequeñas.

### Panel del asistente

Es flotante y compacto por defecto. Sus estados son minimizado, compacto y
expandido. El estado expandido puede integrarse en la vista de conversación,
pero no desplaza permanentemente el timeline ni los resultados.

## Contenido del home en reposo

La cabecera muestra un saludo discreto, un selector de periodo y un compositor
compacto con el mensaje “¿Qué quieres diseñar?”.

El resumen operativo muestra:

- tokens consumidos frente al límite del periodo;
- costo estimado como referencia secundaria;
- número de ejecuciones y porcentaje exitoso;
- tiempo acumulado de procesamiento;
- archivos generados.

Tokens es la métrica principal. El costo se presenta como estimación y debe
declararse como tal. Los fixtures no se presentarán como datos reales. Cuando
una fuente futura no pueda calcular tokens o costo de forma confiable, la
interfaz mostrará “Datos no disponibles” en lugar de inventar valores.

El resto del home contiene actividad reciente, proyectos recientes y
entregables destacados. Se prefieren filas densas, pequeños resúmenes y
divisores sobre una cuadrícula extensa de tarjetas.

## Timeline operacional

El timeline representa el avance de una ejecución con las etapas:

```text
Interpretación → Cálculo → Simulación → Curación → Resultado
```

Cada etapa muestra:

- agente o subsistema responsable;
- estado;
- duración;
- explicación breve;
- métricas o archivos relevantes cuando existan.

Los estados son pendiente, activa, completada y fallida. La etapa activa usa
énfasis moderado y actualización visual; las etapas completadas permanecen
legibles; las pendientes tienen menor contraste. Una etapa puede expandirse
para mostrar detalles, pero los logs técnicos están ocultos por defecto.

Al terminar, el timeline muestra los archivos generados y permite simular las
acciones de abrir, descargar, iniciar otra iteración o asignar la conversación
a un proyecto. En este corte las acciones sin backend muestran feedback local
claro y no pretenden haber persistido cambios.

Una ejecución fallida conserva su historial y archivos parciales. El error se
muestra en la etapa correspondiente con una explicación comprensible y
acciones simuladas para reintentar o modificar la solicitud.

## Flujo de solicitud

1. El usuario escribe una solicitud desde el home.
2. La validación local impide enviar texto vacío.
3. La interfaz crea una conversación temporal mediante el servicio mock.
4. El home selecciona una ejecución simulada y cambia al timeline activo.
5. Las etapas avanzan de forma determinista para demostrar los estados.
6. Al completar, aparecen métricas y archivos mock.
7. El usuario puede asociar localmente la conversación a un proyecto.

La simulación debe ser determinista en pruebas. No se usarán temporizadores
reales como única forma de avanzar estados; el servicio mock o un controlador
de demostración expondrá una forma explícita de producir cada transición.

## Arquitectura del cliente

La implementación se divide en unidades con responsabilidades claras:

```text
src/features/home/
  components/
    HomeScreen.tsx
    HomeSidebar.tsx
    HomeOverview.tsx
    UsageSummary.tsx
    ActivityTimeline.tsx
    ActivityTimelineItem.tsx
    RecentProjects.tsx
    RecentFiles.tsx
    NaturalLanguageComposer.tsx
    AssistantPanel.tsx
    ContextPanel.tsx
  model/
    home-types.ts
    home-fixtures.ts
  services/
    home-service.ts
    mock-home-service.ts
```

Los nombres pueden ajustarse durante el plan si una unidad resulta demasiado
pequeña, pero se preservan estas fronteras:

- `HomeScreen` compone el estado de la experiencia autenticada.
- `HomeOverview` presenta el estado en reposo.
- `UsageSummary` solo representa métricas del periodo.
- `ActivityTimeline` representa una ejecución seleccionada.
- `NaturalLanguageComposer` valida y envía solicitudes sin conocer su fuente
  de datos.
- `AssistantPanel` controla sus tres presentaciones y delega el envío.
- `ContextPanel` representa metadatos y archivos del elemento seleccionado.
- Los componentes reciben datos y callbacks; no importan fixtures ni realizan
  llamadas HTTP.

## Frontera de servicio

`HomeService` será una interfaz tipada con operaciones equivalentes a:

```ts
type HomeService = {
  getHomeOverview(period: UsagePeriod): Promise<HomeOverviewData>
  getRecentActivity(): Promise<ActivitySummary[]>
  submitPrompt(input: PromptInput): Promise<ConversationExecution>
  assignConversationToProject(
    conversationId: string,
    projectId: string,
  ): Promise<ConversationSummary>
}
```

`MockHomeService` implementa el contrato con fixtures y resultados
deterministas. Cuando exista el backend, `RpcHomeService` implementará la misma
interfaz mediante Hono RPC. Los componentes no cambiarán de contrato al
reemplazar una implementación por otra.

Los tipos del servicio describirán explícitamente proyectos, conversaciones,
ejecuciones, etapas, archivos, métricas de uso y disponibilidad de datos. No se
crearán tipos falsos que pretendan ser contratos del servidor.

## Fixtures

Los fixtures cubren al menos:

- home con actividad y consumo;
- home vacío;
- métricas de tokens y costo no disponibles;
- ejecución activa;
- ejecución completada con archivos;
- ejecución fallida con archivos parciales;
- conversación sin proyecto;
- conversación asociada a un proyecto.

La UI indicará que los valores pertenecen a una demostración mientras el
servicio mock esté activo.

## Estados, errores y accesibilidad

- Los estados de carga usan skeletons discretos y conservan la estructura.
- Los errores de carga ofrecen reintento sin borrar el contenido anterior.
- Los errores de ejecución viven en la etapa donde ocurrieron.
- Los cambios importantes se anuncian mediante una región `aria-live`.
- Todos los controles son navegables por teclado y tienen foco visible.
- Estado y progreso no dependen únicamente del color.
- El timeline usa una lista semántica y nombres accesibles para cada etapa.
- El panel flotante conserva el foco al abrirse y lo devuelve al control que lo
  activó al cerrarse.
- `prefers-reduced-motion` elimina transiciones de recorrido y usa cambios de
  estado instantáneos.

## Responsividad

- Escritorio: sidebar, área central y panel contextual visibles; asistente
  flotante.
- Tableta: sidebar más compacta, panel contextual opcional y asistente de menor
  tamaño.
- Móvil: navegación compacta, panel contextual como drawer y asistente como
  hoja inferior.
- El timeline conserva una sola columna y no requiere desplazamiento
  horizontal.
- Las métricas se reordenan sin ocultar tokens ni costo estimado.

## Pruebas y verificación

### Modelo y servicio

- Respuesta del overview para cada periodo.
- Envío vacío rechazado antes del servicio.
- Creación de conversación temporal.
- Asociación local de conversación a proyecto.
- Transiciones deterministas de ejecución.
- Manejo de métricas no disponibles.

### Componentes

- Render del home con datos, vacío, carga y error.
- Cambio de periodo de consumo.
- Tokens como métrica principal y costo como estimación secundaria.
- Expansión de una etapa del timeline.
- Estados activo, completado y fallido.
- Archivos completos y parciales.
- Estados minimizado, compacto y expandido del asistente.
- Envío desde el compositor y transición al timeline.
- Navegación por teclado y anuncios accesibles.

### Verificación manual

- Escritorio, tableta y móvil.
- Ritmo espacial, alineación y densidad visual.
- Contraste y foco.
- Movimiento reducido.
- Contenido largo en nombres de proyectos, conversaciones y archivos.
- Panel contextual y asistente sin cubrir acciones críticas.

## Criterios de aceptación

1. La tarjeta temporal de sesión activa ya no aparece para usuarios
   autenticados.
2. La identidad visible es Ecosistema Multiagente.
3. El home presenta resumen operativo, actividad reciente y entrada de lenguaje
   natural con densidad tipo Linear.
4. Tokens es la métrica de consumo principal y el costo se identifica como
   estimación secundaria.
5. Una solicitud puede enviarse antes de elegir proyecto.
6. El timeline representa las cinco etapas y sus estados sin depender solo del
   color.
7. El asistente no domina el workspace y soporta tres presentaciones.
8. Los componentes no importan fixtures ni realizan llamadas HTTP.
9. El servicio mock implementa una interfaz sustituible por una futura
   implementación Hono RPC.
10. Los estados vacío, activo, completado, fallido y sin métricas están
    cubiertos por fixtures y pruebas.
11. La interfaz es responsiva, accesible y respeta movimiento reducido.
12. El cliente compila y pasan lint y las pruebas añadidas.
