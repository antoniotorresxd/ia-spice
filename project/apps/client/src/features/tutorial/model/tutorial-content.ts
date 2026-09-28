export type TutorialStep = {
  id: string
  badge: string
  title: string
  description: string
  tips?: string[]
  accentColor?: 'mint' | 'copper'
  graphicType?: 'pipeline' | 'prompt' | 'circuit' | 'folder' | 'ai' | 'spice' | 'files'
  targetSelector?: string
  placement?: 'bottom' | 'top' | 'right' | 'left' | 'center'
}

export type TutorialConfig = {
  pageKey: TutorialPageKey
  pageTitle: string
  subtitle: string
  steps: TutorialStep[]
}

export type TutorialPageKey =
  | 'home'
  | 'new_request'
  | 'projects'
  | 'conversations'
  | 'visualizer'
  | 'models'
  | 'profile'

export const TUTORIALS_REGISTRY: Record<TutorialPageKey, TutorialConfig> = {
  home: {
    pageKey: 'home',
    pageTitle: 'Inicio del Ecosistema',
    subtitle: 'Guía interactiva de la plataforma SPICE',
    steps: [
      {
        id: 'home-new-request',
        badge: 'Paso 1: Crear más',
        title: 'Aquí puedes crear solicitudes',
        description:
          'Haz clic en este botón para iniciar un nuevo diseño de circuito, simulación o consulta guiada con los agentes de IA.',
        tips: [
          'Puedes empezar con especificaciones simples o requerimientos avanzados.',
          'El orquestador creará un espacio de trabajo dedicado.',
        ],
        accentColor: 'mint',
        graphicType: 'prompt',
        targetSelector: '[data-tour="new-request"]',
        placement: 'right',
      },
      {
        id: 'home-conversation-area',
        badge: 'Paso 2: Conversación',
        title: 'Ventana de conversación y síntesis',
        description:
          'Aquí es la ventana de conversación. Escribe en lenguaje cotidiano (por ejemplo: "Filtro pasa bajas 1 kHz") y los agentes orquestarán el cálculo y la simulación.',
        tips: [
          'El agente analítico calculará componentes comerciales estándar (E12, E24).',
          'El simulador NGSpice validará las curvas en tiempo real.',
        ],
        accentColor: 'copper',
        graphicType: 'pipeline',
        targetSelector: '[data-tour="conversation-area"]',
        placement: 'bottom',
      },
      {
        id: 'home-projects-tree',
        badge: 'Paso 3: Proyectos',
        title: 'Tus proyectos y carpetas',
        description:
          'En este panel lateral se organizan todos tus proyectos y conversaciones. Puedes redimensionarlo arrastrando el borde derecho o colapsarlo para tener más espacio.',
        tips: [
          'Haz doble clic en el borde para resetear el ancho a 240px.',
          'Mueve conversaciones entre proyectos para mantener orden.',
        ],
        accentColor: 'mint',
        graphicType: 'folder',
        targetSelector: '[data-tour="projects-tree"]',
        placement: 'right',
      },
      {
        id: 'home-sidebar-footer',
        badge: 'Paso 4: Ajustes y Modelos',
        title: 'Preferencias y Visualizador',
        description:
          'Desde aquí accedes a tus configuraciones personales, gestión de proveedores (Claude, GPT) y curvas de simulación.',
        tips: [
          'Configura tus llaves de API en la sección de Modelos.',
          'Puedes volver a abrir este tour en cualquier momento con el botón "?" de la barra superior.',
        ],
        accentColor: 'copper',
        graphicType: 'ai',
        targetSelector: '[data-tour="sidebar-footer"]',
        placement: 'top',
      },
    ],
  },
  new_request: {
    pageKey: 'new_request',
    pageTitle: 'Nueva Solicitud',
    subtitle: 'Cómo encargar el diseño de un nuevo circuito',
    steps: [
      {
        id: 'new-prompt',
        badge: 'Paso 1: Especificación',
        title: 'Define tus Objetivos de Circuito',
        description:
          'Ingresa los parámetros deseados. El agente Orquestador validará la viabilidad de la topología y generará los sub-bloques del circuito.',
        tips: [
          'Puedes pedir divisores de tensión, filtros RC activos/pasivos o etapas con transistores BJT.',
          'Si omites algún valor, los agentes seleccionarán estándares industriales recomendados.',
        ],
        accentColor: 'mint',
        graphicType: 'prompt',
      },
      {
        id: 'new-project-assign',
        badge: 'Paso 2: Destino',
        title: 'Asignación a un Proyecto',
        description:
          'Elige a qué carpeta o proyecto vincular este requerimiento, o déjalo en "Sin proyecto" para clasificarlo después con facilidad.',
        tips: [
          'Asignar proyectos te permite comparar iteraciones de un mismo objetivo técnico.',
        ],
        accentColor: 'copper',
        graphicType: 'folder',
      },
    ],
  },
  projects: {
    pageKey: 'projects',
    pageTitle: 'Proyectos y Carpetas',
    subtitle: 'Organización eficiente de tus experimentos y diseños',
    steps: [
      {
        id: 'projects-structure',
        badge: 'Paso 1: Agrupación',
        title: 'Carpetas por Meta de Diseño',
        description:
          'Agrupa circuitos que compartan objetivos (ej. "Filtros analógicos", "Fuentes de poder") para tener trazabilidad completa de sus versiones.',
        tips: [
          'Cada proyecto muestra la cantidad de conversaciones y su fecha de actualización.',
        ],
        accentColor: 'copper',
        graphicType: 'folder',
      },
      {
        id: 'projects-dragdrop',
        badge: 'Paso 2: Productividad',
        title: 'Organización Rápida Drag & Drop',
        description:
          'Arrastra cualquier conversación desde la sección "Espacio" en el sidebar directamente a una carpeta para moverla sin cambiar de pantalla.',
        tips: [
          'También puedes usar el menú de tres puntos (...) en cada conversación para moverla.',
        ],
        accentColor: 'mint',
        graphicType: 'pipeline',
      },
    ],
  },
  conversations: {
    pageKey: 'conversations',
    pageTitle: 'Conversación y Espacio de Diseño',
    subtitle: 'Interacción con agentes, observabilidad de trazas e inspección de circuitos',
    steps: [
      {
        id: 'conversations-composer',
        badge: 'Paso 1: Solicitud',
        title: 'Diseño Asistido por Agentes de IA',
        description:
          'Escribe tus especificaciones de circuito o solicita modificaciones sobre el diseño actual. Cuenta con barra de herramientas de formato para negritas, listas y bloques de código SPICE.',
        tips: [
          'Indica parámetros clave como frecuencia de corte, ganancia o voltajes de polarización.',
          'Activa el modo edición para redactar requerimientos extensos con comodidad.',
        ],
        accentColor: 'mint',
        graphicType: 'prompt',
        targetSelector: '[data-tour="conversation-composer"]',
        placement: 'top',
      },
      {
        id: 'conversations-panel-toggle',
        badge: 'Paso 2: Inspección',
        title: 'Panel Lateral de Inspección',
        description:
          'Accede a toda la información técnica generada en tiempo real. Puedes abrir u ocultar el panel con este botón cuando necesites mayor área de lectura.',
        tips: [
          'Se abre automáticamente al generarse un circuito o netlist nuevo.',
          'Muestra un contador con la cantidad de archivos SPICE producidos.',
        ],
        accentColor: 'copper',
        graphicType: 'folder',
        targetSelector: '[data-tour="panel-toggle"]',
        placement: 'bottom',
      },
      {
        id: 'conversations-flow',
        badge: 'Paso 3: Flujo',
        title: 'Flujo de Ejecución y Convergencia',
        description:
          'Sigue en directo cada fase de la síntesis: Orquestación, Cálculo de componentes comerciales, Simulación NGSpice y Curaduría de tolerancias con diagnósticos técnicos si algo falla.',
        tips: [
          'Los estados indican el tiempo de ejecución de cada etapa.',
          'Si la simulación no converge, el curador provee sugerencias de parámetros.',
        ],
        accentColor: 'mint',
        graphicType: 'pipeline',
        targetSelector: '[data-tour="inspector-tabs"]',
        placement: 'left',
      },
      {
        id: 'conversations-langfuse-trace',
        badge: 'Paso 4: Observabilidad',
        title: 'Traza Langfuse y Llamadas LLM',
        description:
          'Audita con total transparencia las inferencias de inteligencia artificial: identificador de traza, latencias, recuento de tokens (entrada/salida), costos y los prompts y respuestas exactas de cada modelo.',
        tips: [
          'Despliega el acordeón de cada llamada para ver el prompt del sistema y la salida generada.',
          'Copia el ID de la traza para correlacionar eventos en Langfuse Cloud.',
        ],
        accentColor: 'copper',
        graphicType: 'ai',
        targetSelector: '[data-tour="tab-trace"]',
        placement: 'left',
      },
      {
        id: 'conversations-artifacts-resize',
        badge: 'Paso 5: Archivos y Tamaño',
        title: 'Archivos SPICE y Panel Redimensionable',
        description:
          'Descarga tus archivos .cir listos para simulación externa o ábrelos con un clic en el Visualizador. Puedes arrastrar el borde izquierdo para ajustar el ancho del panel a tu gusto.',
        tips: [
          'El ancho personalizado se recuerda automáticamente entre sesiones.',
          'Los archivos .cir son 100% compatibles con NGSpice, LTSpice y software EDA estándar.',
        ],
        accentColor: 'mint',
        graphicType: 'files',
        targetSelector: '[data-tour="tab-files"]',
        placement: 'left',
      },
    ],
  },
  visualizer: {
    pageKey: 'visualizer',
    pageTitle: 'Visualizador y Análisis de Netlist',
    subtitle: 'Exploración esquemática, análisis de simulación y código SPICE',
    steps: [
      {
        id: 'visualizer-selector',
        badge: 'Paso 1: Circuito',
        title: 'Selección de Archivo y Recarga',
        description:
          'Selecciona cualquier archivo .cir generado en tus proyectos desde el desplegable. Usa el botón "Actualizar" para recalcular el análisis y redibujar el esquema vectorial.',
        tips: [
          'El enlace "Ver conversación" te lleva directamente al chat donde nació el diseño.',
          'Agrupa circuitos por proyecto para comparativas rápidas de versiones.',
        ],
        accentColor: 'mint',
        graphicType: 'folder',
        targetSelector: '[data-tour="circuit-selector"]',
        placement: 'bottom',
      },
      {
        id: 'visualizer-view-modes',
        badge: 'Paso 2: Vistas',
        title: 'Modos de Visualización',
        description:
          'Alterna entre el Diagrama Esquemático vectorial, la Curva de Simulación NGSpice (frecuencia/tiempo) y el Visor de Código Netlist SPICE.',
        tips: [
          '"Diagrama Esquemático" renderiza componentes, etiquetas y tierras automáticamente.',
          '"Curva de Simulación SPICE" muestra gráficos interactivos con puntos de corte y magnitudes.',
        ],
        accentColor: 'copper',
        graphicType: 'pipeline',
        targetSelector: '[data-tour="view-toggle"]',
        placement: 'bottom',
      },
      {
        id: 'visualizer-code-viewer',
        badge: 'Paso 3: Código SPICE',
        title: 'Visor de Netlist Estilo IDE',
        description:
          'Examina el netlist SPICE validado en un visor con numeración de líneas, coloreado sintáctico de directivas, nodos y componentes, y opciones para copiar o descargar el archivo.',
        tips: [
          'El código es de solo lectura porque refleja el netlist exacto validado por los agentes.',
          'Puedes copiar el netlist completo al portapapeles con un solo clic.',
        ],
        accentColor: 'mint',
        graphicType: 'spice',
        targetSelector: '[data-tour="circuit-viewer"]',
        placement: 'bottom',
      },
      {
        id: 'visualizer-book-explanation',
        badge: 'Paso 4: Análisis',
        title: 'Explicación Técnica y Componentes',
        description:
          'Lectura unificada vertical sin paneles superpuestos: analiza la función de cada nodo, la topología circuital y el desglose de valores comerciales normalizados.',
        tips: [
          'Incluye valores comerciales de series estándar (E12, E24) calculados por la IA.',
          'Detalla los nodos de entrada, salida y conexiones de retroalimentación.',
        ],
        accentColor: 'copper',
        graphicType: 'circuit',
        targetSelector: '[data-tour="circuit-explanation"]',
        placement: 'top',
      },
    ],
  },
  models: {
    pageKey: 'models',
    pageTitle: 'Configuración de Modelos LLM',
    subtitle: 'Asignación de inteligencias artificiales para cada agente',
    steps: [
      {
        id: 'models-agents',
        badge: 'Paso 1: Roles',
        title: 'Modelos Independientes por Agente',
        description:
          'Puedes configurar modelos distintos para cada rol: asignar un modelo rápido para el Orquestador y uno más avanzado para el Curador de circuitos.',
        tips: [
          'Permite optimizar costos y tiempos de respuesta según la complejidad de cada tarea.',
        ],
        accentColor: 'mint',
        graphicType: 'ai',
      },
      {
        id: 'models-providers',
        badge: 'Paso 2: Proveedores',
        title: 'Multi-Proveedor y Modelos Locales',
        description:
          'Conecta tus claves de API para OpenAI (GPT-4o), Anthropic (Claude 3.5), Google Gemini o tu servidor local de Ollama para privacidad total.',
        tips: [
          'Tus claves se cifran y almacenan de forma segura en la base de datos de tu usuario.',
        ],
        accentColor: 'copper',
        graphicType: 'ai',
      },
    ],
  },
  profile: {
    pageKey: 'profile',
    pageTitle: 'Perfil y Sesión',
    subtitle: 'Administración de tu cuenta y preferencias',
    steps: [
      {
        id: 'profile-info',
        badge: 'Paso 1: Identidad',
        title: 'Datos de Usuario',
        description:
          'Gestiona tu nombre de visualización, correo electrónico y credenciales seguras asociadas a tu espacio de trabajo.',
        tips: [
          'El avatar del sidebar reflejará tus iniciales automáticamente.',
        ],
        accentColor: 'mint',
        graphicType: 'ai',
      },
    ],
  },
}
