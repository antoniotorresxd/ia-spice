# Diseño: perfil y configuración de modelos en el cliente

Fecha: 2026-07-15

## Contexto

El home autenticado del Ecosistema Multiagente ya presenta un workspace tipo
Linear con sidebar, resumen operativo, timeline y asistente flotante. Dos
detalles requieren refinamiento: el cierre de sesión aparece aislado debajo del
perfil y el estado minimizado del asistente usa un botón textual provisional.

La configuración de modelos también necesita una experiencia dedicada. El
servidor ya tiene un catálogo global de LLMs, pero este corte no lo modifica ni
lo consume. El cliente modelará la experiencia objetivo con datos mock:
conexiones personales reutilizables y una asignación de conexión/modelo por
agente.

## Objetivo

Construir en el cliente:

- un menú de perfil compacto y accesible;
- una ruta de perfil editable con estado local;
- una ruta de configuración de conexiones LLM y asignaciones por agente;
- una frontera de servicio mock sustituible por Hono RPC;
- un trigger minimizado del asistente que se integre con el lenguaje visual.

## Alcance

### Incluido

- Popover de perfil desde la parte inferior de la sidebar.
- Navegación autenticada a `/`, `/settings/profile` y `/settings/models`.
- Ruta de perfil con avatar, nombre y correo de solo lectura.
- Ruta de modelos con CRUD local de conexiones.
- Providers `openai`, `anthropic`, `google` y `openai_compatible`.
- Reutilización de una conexión en varios agentes.
- Selección independiente de modelo por agente.
- API keys enmascaradas después de capturarse.
- Servicios, tipos y fixtures mock.
- Orb cuadrado para abrir el asistente minimizado.
- Pruebas de interacción, routing y accesibilidad.

### Fuera de alcance

- Cambios en el servidor, base de datos o proyecto Python.
- Llamadas Hono RPC.
- Persistencia real o `localStorage`.
- Cifrado real de secrets en el cliente.
- Validación de credenciales contra providers.
- Carga real de avatar.
- Cambio de correo o contraseña.
- Permisos administrativos y configuraciones globales.

## Navegación autenticada

Se incorporará React Router con estas rutas:

```text
/                  → home operativo
/settings/profile  → perfil del usuario
/settings/models   → conexiones y asignaciones LLM
```

El gate de Better Auth permanece en `App`. Sin sesión se muestra
autenticación; con sesión se monta el router autenticado. Las tres rutas
comparten shell, sidebar, identidad y acceso al asistente. Solo cambia el área
central.

Una ruta autenticada desconocida redirige a `/`. No se agregará routing para
secciones todavía inexistentes de la sidebar.

## Menú de perfil

El bloque inferior de la sidebar se convierte en un único botón con:

- avatar o inicial;
- nombre;
- contexto “Workspace personal”;
- indicador de expansión.

Al activarlo se abre un popover hacia arriba con:

- `Perfil`, que navega a `/settings/profile`;
- `Modelos y providers`, que navega a `/settings/models`;
- `Cerrar sesión`, que conserva el callback de autenticación existente.

No habrá una opción genérica “Configuración”, porque duplicaría el destino de
modelos. El menú se cierra al seleccionar una acción, presionar `Escape`, hacer
clic exterior o cerrar la navegación móvil. El foco regresa al trigger.

En móvil se presenta como bottom sheet anclado a la zona inferior. El orden y
las etiquetas permanecen iguales.

## Ruta de perfil

`/settings/profile` contiene una cabecera, descripción y una superficie de
formulario con:

- avatar con preview local;
- nombre editable;
- correo visible y deshabilitado;
- etiqueta explícita `Datos de demostración`;
- botones `Guardar cambios` y `Descartar`.

Guardar actualiza el servicio mock y muestra confirmación accesible. Descartar
restaura los valores entregados por el servicio. Un nombre vacío o compuesto
solo por espacios se rechaza localmente. El archivo de avatar se mantiene solo
en memoria y se revoca cualquier object URL al reemplazarlo o desmontar la
pantalla.

## Ruta de modelos y providers

`/settings/models` contiene dos secciones estables.

### Conexiones

Una conexión representa credenciales y endpoint reutilizables. Sus campos son:

- `id`;
- `label`;
- `provider`;
- `apiKey` solo durante creación o reemplazo;
- `keyHint` después de guardar;
- `baseUrl` para `openai_compatible`;
- timestamps mock.

Los providers soportados son:

| Provider | Key | Base URL |
|---|---|---|
| OpenAI | requerida | no |
| Anthropic | requerida | no |
| Google | requerida | no |
| OpenAI compatible | opcional | requerida |

La lista muestra provider, label, endpoint cuando aplique y estado de
credencial. Una key guardada solo aparece como `••••` más `keyHint`; la key
completa no vuelve a renderizarse. Editar sin escribir una key conserva la
existente. El CRUD es local y soporta crear, editar y eliminar.

No se podrá eliminar una conexión asignada a un agente sin confirmar. Al
confirmar, las asignaciones afectadas quedan sin conexión y muestran un estado
de atención; no se reasignan de forma silenciosa.

### Asignaciones por agente

Cada agente tiene una asignación independiente:

- `agentId`;
- nombre legible;
- `connectionId` nullable;
- `model`;
- estado configurado o pendiente.

El primer catálogo incluirá `Orquestador`, `Cálculo`, `Escritura` y `Curador`,
los componentes planeados que pueden depender de un LLM. `Shell` no tendrá
asignación porque ejecuta NGSpice de forma determinista. Una misma conexión
puede usarse en varios agentes y cada agente puede escribir un modelo distinto.

Las asignaciones se editan en filas compactas: selector de conexión, campo de
modelo y acción Guardar. No se exige que todos los agentes estén configurados.
El estado incompleto es visible y no bloquea editar otras filas.

## Servicios y tipos

La funcionalidad se aislará en un feature de settings:

```text
src/features/settings/
  components/
    SettingsShell.tsx
    ProfileSettingsScreen.tsx
    ModelSettingsScreen.tsx
    ConnectionList.tsx
    ConnectionForm.tsx
    AgentAssignmentList.tsx
  model/
    settings-types.ts
    settings-fixtures.ts
    settings-validation.ts
  services/
    settings-service.ts
    mock-settings-service.ts
```

La interfaz `SettingsService` expondrá operaciones equivalentes a:

```ts
type SettingsService = {
  getProfile(): Promise<UserProfile>
  updateProfile(input: UpdateProfileInput): Promise<UserProfile>
  listConnections(): Promise<LlmConnection[]>
  createConnection(input: ConnectionInput): Promise<LlmConnection>
  updateConnection(id: string, input: ConnectionInput): Promise<LlmConnection>
  deleteConnection(id: string): Promise<void>
  listAgentAssignments(): Promise<AgentAssignment[]>
  updateAgentAssignment(
    agentId: AgentId,
    input: AgentAssignmentInput,
  ): Promise<AgentAssignment>
}
```

Solo `mock-settings-service` importa fixtures. Las pantallas reciben el
servicio por inyección desde el router autenticado. Una futura implementación
RPC deberá mantener esta frontera o adaptar los DTOs del servidor a estos tipos
de vista.

El mock mantiene estado en memoria durante la sesión de la aplicación. No usa
`localStorage`, cookies, parámetros de URL ni logs para secrets.

## Asistente minimizado

El botón textual `Abrir asistente` se sustituye por un orb cuadrado:

- 48×48 px en escritorio y mínimo táctil de 44×44 px;
- radio consistente con controles del home;
- marca `EM`;
- indicador visual de disponibilidad;
- tooltip `Abrir asistente` en hover y foco;
- nombre accesible equivalente;
- estados hover, foco, active y disabled.

El trigger permanece en la esquina inferior derecha. En móvil respeta safe
areas y no cubre acciones primarias. La apertura conserva los estados compacto
y expandido ya existentes.

## Manejo de secrets y seguridad de interfaz

- Las API keys usan `type="password"` durante captura.
- La key completa no se copia a estado de lectura después de guardar.
- Las listas y fixtures persistidos solo contienen `hasKey` y `keyHint`.
- Ningún error incluye el valor introducido.
- No hay logging de formularios.
- El diseño declara que la seguridad real depende del futuro backend; el
  cliente nunca se presentará como almacén seguro de secrets.

## Estados y errores

Las dos rutas contemplan carga, datos, vacío y error. El servicio mock puede
producir errores deterministas para probar feedback seguro y reintento.

Los formularios conservan datos ante errores, bloquean envíos duplicados y
anuncian éxito o fallo con `aria-live`. Eliminar requiere confirmación. Cerrar
un formulario con cambios sin guardar pide confirmación local.

## Accesibilidad y responsividad

- El popover usa semántica de menú y navegación por teclado.
- `Escape` cierra popovers, dialogs y drawers.
- El foco se restaura al trigger que abrió cada superficie.
- Los labels están asociados a campos reales.
- El estado de credenciales no depende solo del color.
- Los secrets pueden mostrarse temporalmente mediante un control con nombre
  accesible, pero vuelven a ocultarse al cerrar el formulario.
- En móvil, formularios y listas se apilan sin scroll horizontal.
- `prefers-reduced-motion` elimina transiciones del popover, drawers y orb.

## Pruebas

### Menú y routing

- apertura y cierre por botón, `Escape` y clic exterior;
- retorno de foco;
- navegación a perfil y modelos;
- cierre de sesión delegado;
- redirección de ruta desconocida.

### Perfil

- carga de valores mock;
- correo no editable;
- nombre vacío rechazado;
- guardado y descarte;
- preview local de avatar y cleanup de object URL;
- errores seguros.

### Conexiones

- validación específica por provider;
- creación, edición y eliminación;
- conservación de key al editar sin reemplazo;
- key completa ausente después de guardar;
- confirmación al eliminar una conexión asignada.

### Asignaciones

- una conexión reutilizada por varios agentes;
- modelos distintos por agente;
- asignación incompleta visible;
- conexión eliminada deja asignaciones en atención.

### Asistente

- orb con nombre accesible y tooltip;
- apertura desde estado minimizado;
- estados compacto y expandido conservados;
- retorno de foco al minimizar o cerrar.

## Criterios de aceptación

1. Cerrar sesión deja de aparecer como botón aislado bajo el perfil.
2. El perfil abre un popover con Perfil, Modelos y providers, y Cerrar sesión.
3. Las rutas de perfil y modelos conservan el shell autenticado.
4. Perfil edita localmente nombre y avatar; el correo es de solo lectura.
5. El catálogo soporta cuatro familias de provider y conexiones reutilizables.
6. Cada agente puede elegir conexión y modelo propios.
7. Ninguna key completa aparece después de guardar ni se persiste en storage.
8. Settings depende de una interfaz mock sustituible por RPC.
9. El asistente minimizado usa el orb cuadrado y tooltip aprobado.
10. Menús, dialogs, formularios y rutas son accesibles y responsivos.
11. El cliente compila y pasan lint y todas las pruebas añadidas.
