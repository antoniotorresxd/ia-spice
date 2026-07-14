# Diseño: autenticación del cliente con autómata animado

Fecha: 2026-07-13

## Contexto

El cliente continúa como una plantilla de Vite y React sin integración con el
servidor. El servidor ya expone Better Auth en `/api/auth/*` con correo y
contraseña, pero aún no configura proveedores sociales. Paralelamente se está
introduciendo una estructura de monorepo que permitirá compartir el tipo de la
aplicación Hono y consumir las APIs propias mediante Hono RPC.

Este corte construye dentro de `project/apps/client` la primera experiencia
visual real del producto: registro e inicio de sesión. La dirección aprobada es
una interfaz oscura y precisa, inspirada en la densidad y jerarquía de productos
como Linear, con una superficie unificada dividida entre una representación del
ecosistema multiagente y el formulario de acceso.

## Objetivo

Construir una experiencia de autenticación pulida, responsiva y accesible que:

- permita alternar entre inicio de sesión y registro;
- ofrezca correo/contraseña y accesos con Google, Microsoft y GitHub;
- comunique la identidad técnica del producto mediante un autómata animado;
- mantenga la lógica de red aislada de los componentes visuales;
- quede preparada para la integración del monorepo y Hono RPC sin acoplar el
  cliente a rutas escritas manualmente.

## Alcance del corte

### Incluido

- Sustitución de la plantilla de Vite por la pantalla de autenticación.
- Diseño responsivo de una sola superficie con división interna.
- Modos `sign-in` y `sign-up` dentro de la misma experiencia.
- Campos de correo y contraseña, incluyendo confirmación de contraseña en el
  registro.
- Botones de Google, Microsoft y GitHub.
- Estados visuales de carga, error, deshabilitado, foco y éxito.
- Autómata animado que representa la solución completa.
- Frontera de autenticación independiente de la futura capa Hono RPC.
- Pruebas unitarias de la lógica del formulario y pruebas de componentes para
  las transiciones principales.

### Fuera de alcance

- Dashboard posterior al acceso.
- Espacios de trabajo, API keys y generación de circuitos.
- Cambios estructurales del monorepo que otra línea de trabajo está
  introduciendo.
- Configuración de credenciales OAuth y cambios del servidor para habilitar
  Google, Microsoft y GitHub. Los controles quedarán implementados; si un
  proveedor aún no está configurado, el adaptador devolverá un error de
  disponibilidad claro.
- Recuperación de contraseña completa. En este corte se muestra el acceso a la
  acción, pero solo se habilitará cuando exista el flujo correspondiente en el
  servidor.

## Dirección visual

La pantalla usa un fondo grafito con auroras difuminadas en verde menta,
violeta y azul. La superficie principal aplica vidrio oscuro de manera
contenida: borde de bajo contraste, desenfoque, sombra amplia y un único radio
exterior. La división entre ilustración y formulario es una línea interna, no
dos tarjetas superpuestas.

El panel izquierdo contiene la marca, un mensaje corto y el autómata. El panel
derecho contiene la autenticación. La jerarquía evita que el fondo o la
animación compitan con los campos.

Los colores funcionales son:

- menta para ruta activa y estados válidos;
- violeta para la decisión del curador y el lazo de ajuste;
- gris neutro para rutas inactivas y rechazo;
- blanco suave para la acción primaria.

No se utilizarán efectos de neón intensos, partículas aleatorias ni movimiento
continuo fuera del autómata y las auroras ambientales.

## Autómata visual

El autómata representa la topología objetivo de la tesina:

```text
Inicio → Orquestador → Cálculo → Síntesis → Curador
             │                         ↑       │
             └→ Rechazado              └adjust┤
                                              ├accept→ Aceptado
                                              └reject→ Rechazado
```

Estados:

1. `Inicio`: solicitud recibida.
2. `Orquestador`: valida y normaliza la especificación.
3. `Cálculo`: ejecuta el trabajo Master-Worker.
4. `Síntesis`: encapsula Escritura y Shell.
5. `Curador`: decide aceptar, ajustar o rechazar.
6. `Aceptado`: estado terminal exitoso.
7. `Rechazado`: estado terminal por entrada inválida, error o agotamiento.

La animación usa un indicador que recorre una transición por vez. Al llegar a
un estado, el nodo recibe énfasis y el anterior vuelve al estado neutro. Una
secuencia demostrativa recorre el camino principal, ejecuta al menos una vez el
lazo `Curador → Síntesis` y termina en `Aceptado`. Después de una pausa reinicia.

Las aristas no dependen únicamente del color: incluyen dirección, etiquetas y
diferencias de trazo. Con `prefers-reduced-motion: reduce`, el recorrido se
detiene y se muestra una instantánea legible con el camino principal marcado.

El autómata es una visualización explicativa; no pretende reflejar el estado de
una ejecución real durante la autenticación.

## Arquitectura del cliente

La implementación se divide en unidades pequeñas:

```text
src/
  app/
    App.tsx
  features/auth/
    components/
      AuthScreen.tsx
      AuthForm.tsx
      SocialAuthButtons.tsx
      AuthModeSwitch.tsx
    services/
      auth-client.ts
      auth-service.ts
    model/
      auth-types.ts
      auth-validation.ts
  components/automaton/
    SolutionAutomaton.tsx
    automaton-model.ts
  lib/api/
    rpc-client.ts
  styles/
    tokens.css
    globals.css
```

Los nombres exactos pueden adaptarse a la estructura final del monorepo, pero
se conservan las fronteras siguientes:

- `AuthScreen` compone la experiencia y controla el modo visual.
- `AuthForm` gestiona datos, validación y envío; no conoce URLs.
- `SocialAuthButtons` representa proveedores desde una configuración tipada.
- `auth-service` expone operaciones de dominio (`signInWithEmail`,
  `signUpWithEmail`, `signInWithProvider`, `signOut`).
- `auth-client` configura el cliente oficial de Better Auth.
- `rpc-client` configura `hc<AppType>` para APIs propias de Hono cuando el tipo
  compartido esté disponible en el monorepo.
- `SolutionAutomaton` solo dibuja y anima el modelo definido en
  `automaton-model`; no contiene lógica de autenticación.

No se usará `fetch` directamente desde componentes. Tampoco se duplicarán a
mano los contratos Hono en el cliente.

## Better Auth y Hono RPC

Se mantienen dos clientes con responsabilidades distintas:

1. Better Auth client consume `/api/auth/*`, administra sesiones y ejecuta los
   flujos de correo y proveedores sociales.
2. Hono RPC consume las rutas tipadas propias de la aplicación mediante
   `hc<AppType>` y credenciales de cookie.

Ambos leen una única URL base validada desde `VITE_API_URL`. El cliente Hono
usa `credentials: "include"`. El servidor conserva CORS con credenciales y el
origen exacto del cliente.

Cuando el monorepo exponga `AppType`, `rpc-client.ts` lo importará desde el
paquete compartido o export público acordado. Hasta entonces no se crea un tipo
falso ni se importa un archivo interno del servidor mediante rutas relativas
frágiles.

## Flujo de interacción

### Inicio de sesión por correo

1. El usuario completa correo y contraseña.
2. La validación local marca campos inválidos sin enviar la solicitud.
3. El formulario entra en estado de carga y deshabilita acciones duplicadas.
4. `auth-service` delega en Better Auth.
5. En éxito se actualiza la sesión y se entrega el control al enrutamiento
   posterior, que en este corte puede mostrar un estado autenticado mínimo.
6. En error se presenta un mensaje general y, cuando sea seguro, un mensaje de
   campo útil.

### Registro por correo

El modo registro solicita nombre, correo, contraseña y confirmación. La
confirmación solo existe en el cliente y no se transmite al servidor. Better
Auth realiza el registro con `autoSignIn`, por lo que el resultado exitoso deja
sesión activa.

### Proveedor social

El botón seleccionado llama `signInWithProvider` con un identificador tipado:
`google`, `microsoft` o `github`. Durante la redirección todos los proveedores
quedan deshabilitados para evitar solicitudes dobles. Los iconos tienen nombre
accesible y texto visible en pantallas suficientes; no dependen de letras o
símbolos ambiguos.

## Errores y seguridad de interfaz

- Los mensajes no revelan si una cuenta concreta existe cuando el servidor no
  lo autoriza.
- Los errores inesperados usan un mensaje general y permanecen disponibles
  para tecnologías de asistencia mediante una región `aria-live`.
- Nunca se registran contraseñas, tokens ni respuestas completas de sesión.
- Las cookies siguen siendo administradas por Better Auth; no se guardan
  tokens de sesión en `localStorage`.
- Los botones previenen reenvíos mientras existe una operación activa.
- La contraseña se oculta por defecto y su control de visibilidad declara un
  nombre accesible.

## Responsividad

- Escritorio: dos columnas dentro de una superficie única.
- Tableta: columnas más equilibradas y autómata simplificado si falta espacio.
- Móvil: formulario primero; el panel del autómata aparece debajo como bloque
  informativo compacto. Ningún control requiere desplazamiento horizontal.
- La altura usa unidades dinámicas de viewport con espacio seguro superior e
  inferior.

## Accesibilidad

- Contraste mínimo WCAG AA para texto y controles.
- Etiquetas reales asociadas a cada campo.
- Navegación completa por teclado y foco visible.
- Iconos decorativos ocultos a tecnologías de asistencia.
- El SVG del autómata incluye título y descripción, pero no expone cada nodo
  como control interactivo.
- `prefers-reduced-motion` desactiva desplazamientos, pulsos y auroras.
- Los modos inicio/registro se expresan con botones y estado accesible, no con
  enlaces que dependan solo del color.

## Pruebas y verificación

### Lógica

- correo inválido;
- contraseña vacía o con menos de ocho caracteres;
- confirmación diferente;
- transformación correcta del formulario a las entradas del servicio;
- proveedor social restringido al conjunto permitido.

### Componentes

- alternancia entre inicio y registro;
- estado de carga y bloqueo de doble envío;
- presentación de error accesible;
- llamada correcta al proveedor seleccionado;
- render estático válido con movimiento reducido.

### Verificación manual

- Vistas de escritorio, tableta y móvil.
- Orden de tabulación y foco.
- Tema oscuro y contraste.
- Animación completa del autómata, incluido el lazo de ajuste.
- Flujo real de correo/contraseña cuando el servidor esté disponible.
- Flujo real de cada proveedor una vez configuradas sus credenciales.

## Criterios de aceptación

1. La plantilla de Vite ya no aparece.
2. La pantalla coincide con la composición F3A aprobada y se percibe como una
   sola superficie.
3. El autómata recorre estados de forma legible, muestra el lazo de ajuste y
   termina en un estado terminal.
4. Movimiento reducido produce una representación estática útil.
5. Inicio y registro por correo tienen validación, carga y error.
6. Google, Microsoft y GitHub están representados mediante controles
   accesibles y conectados al adaptador de autenticación.
7. Ningún componente visual realiza llamadas HTTP directas.
8. La futura integración Hono RPC tiene un módulo aislado y no duplica tipos
   del servidor.
9. El cliente compila y pasa lint y las pruebas añadidas.
