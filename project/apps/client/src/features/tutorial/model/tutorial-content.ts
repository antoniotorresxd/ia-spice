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
    pageTitle: 'Conversaciones y Entregables',
    subtitle: 'Seguimiento del timeline de agentes e inspección de resultados',
    steps: [
      {
        id: 'conversations-timeline',
        badge: 'Paso 1: Timeline',
        title: 'Etapas de Ejecución en Vivo',
        description:
          'Revisa cada etapa completada por los agentes: Interpretación, Selección comercial de R/C/L, Síntesis de netlist y Simulación NGSpice.',
        tips: [
          'Los indicadores verdes muestran las etapas validadas por el Curador.',
        ],
        accentColor: 'mint',
        graphicType: 'pipeline',
      },
      {
        id: 'conversations-artifacts',
        badge: 'Paso 2: Entregables',
        title: 'Archivos Generados por el Ecosistema',
        description:
          'Descarga e inspecciona los artefactos reales producidos: archivos .cir para simular, .csv con puntos de respuesta en frecuencia y esquemáticos .svg.',
        tips: [
          'Puedes abrir directamente el netlist en el Visualizador integrado con 1 clic.',
        ],
        accentColor: 'copper',
        graphicType: 'files',
      },
      {
        id: 'conversations-curator',
        badge: 'Paso 3: Curaduría',
        title: 'Validación y Tolerancias',
        description:
          'El Curador analiza si la simulación real cumplió las metas (error porcentual, estabilidad). Si no converge, ajusta componentes automáticamente.',
        tips: [
          'El sistema se auto-corrige hasta alcanzar las especificaciones deseadas.',
        ],
        accentColor: 'mint',
        graphicType: 'circuit',
      },
    ],
  },
  visualizer: {
    pageKey: 'visualizer',
    pageTitle: 'Visualizador de Circuitos',
    subtitle: 'Edición en vivo de netlists SPICE y simulación gráfica',
    steps: [
      {
        id: 'visualizer-editor',
        badge: 'Paso 1: Editor',
        title: 'Edición de Netlists SPICE (.cir)',
        description:
          'Escribe o ajusta la lista de componentes, nodos y directivas como .ac, .tran o modelos de transistores en el editor de código integrado.',
        tips: [
          'Soporta sintaxis estándar de NGSpice y componentes comerciales.',
        ],
        accentColor: 'mint',
        graphicType: 'spice',
      },
      {
        id: 'visualizer-schematic',
        badge: 'Paso 2: Esquemático',
        title: 'Generación Automática de Esquemático',
        description:
          'La plataforma traduce la lista de nodos del netlist a un diagrama esquemático vectorial claro, ordenando ramas y referencias a tierra.',
        tips: [
          'Te permite verificar visualmente las conexiones antes de lanzar una simulación larga.',
        ],
        accentColor: 'copper',
        graphicType: 'circuit',
      },
      {
        id: 'visualizer-run',
        badge: 'Paso 3: Simulación',
        title: 'Motor NGSpice en el Servidor',
        description:
          'El botón de simulación envía el netlist al binario real de NGSpice en el servidor, retornando curvas de respuesta en frecuencia o tiempo.',
        tips: [
          'Sin emuladores en JS: son cálculos reales con las librerías científicas de SPICE.',
        ],
        accentColor: 'mint',
        graphicType: 'pipeline',
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
