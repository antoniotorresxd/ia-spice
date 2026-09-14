# Compendio de Fichas de Diseño Teórico de Circuitos Electrónicos Analógicos

Este documento reúne las fichas de diseño teórico para 6 topologías fundamentales en análisis y diseño de circuitos analógicos, basadas en la literatura de referencia.

---

## 1. Filtro Pasa-Bajos Pasivo RC de 1.er Orden

### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Filtro pasivo paso bajo RC de primer orden.
* **Función principal:** Atenúa las componentes de alta frecuencia de una señal de entrada y permite el paso de las frecuencias situadas por debajo de su frecuencia de corte ($f_c$). Se utiliza en señales de corriente alterna (CA) para eliminación de ruido de alta frecuencia, acondicionamiento de señal previo a etapas de conversión analógica-digital (anti-aliasing) y suavizado de pulsos.

### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Resistor $R$, condensador $C$.
* **Conexión exacta:** La fuente de señal de entrada $v_{in}$ se conecta a un terminal de la resistencia $R$. El otro terminal de $R$ se conecta al nodo de salida $v_{out}$ y al terminal positivo del condensador $C$. El segundo terminal de $C$ se conecta a la referencia común (tierra/GND). La tensión de salida se mide en paralelo a los bornes del condensador.

### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Frecuencia de corte deseada ($f_c$ o $\omega_c$):** Frecuencia a la cual la magnitud de la salida cae a $-3\text{ dB}$ ($0.707$ de la entrada).
* **Valor comercial del condensador ($C$):** Se selecciona de forma libre como punto de partida práctico.
* **Impedancia de fuente ($Z_g$) e impedancia de carga ($R_L$):** Especificaciones de acoplamiento del circuito.

### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Efecto de carga:** La resistencia de carga $R_L$ conectada a la salida debe ser significativamente mayor que la resistencia $R$ ($R_L \ge 10R$) para no alterar la frecuencia de corte.
* **Pendiente de atenuación:** En la banda de rechazo es de $-20\text{ dB/década}$ ($-6\text{ dB/octava}$).
* **Desfase:** En la frecuencia de corte $f_c$, el desfase entre la salida y la entrada es exactamente $-45^\circ$.

### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Selección del condensador ($C$):** Fijar un valor comercial práctico (ej. $10\text{ nF}$ o $1\,\mu\text{F}$).
2. **Cálculo de la resistencia ($R$):**
   $$R = \frac{1}{2\pi \cdot f_c \cdot C}$$
3. **Función de transferencia:**
   $$H(s) = \frac{1}{1 + sRC} \quad \implies \quad |H(f)| = \frac{1}{\sqrt{1 + (2\pi f RC)^2}}$$
4. **Respuesta de fase:**
   $$\theta(f) = -\arctan(2\pi f RC)$$

### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Diseñar un filtro paso bajo con $f_c = 10\text{ kHz}$.
* **Paso 1:** Se escoge un condensador comercial $C = 10\text{ nF} = 10^{-8}\text{ F}$.
* **Paso 2:** Cálculo de $R$:
  $$R = \frac{1}{2\pi \cdot 10000 \cdot 10^{-8}} \approx 1591.55\text{ }\Omega \quad (1.59\text{ k}\Omega)$$
* **Verificación:** A $f_c = 10\text{ kHz}$, $|H(f_c)| = 0.7071$ ($-3\text{ dB}$) y fase $\theta = -45^\circ$.

---

## 2. Polarización por Divisor de Voltaje en Transistor BJT (Emisor Común)

### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Circuito de polarización por divisor de voltaje (tensión) para transistor BJT en configuración Emisor Común.
* **Función principal:** Polariza el transistor en corriente continua (CC) fijando un punto de operación estable $Q$ ($I_{CQ}$, $V_{CEQ}$) en la región activa. Se utiliza en amplificadores analógicos de CA para evitar distorsiones y garantizar la estabilidad del punto de trabajo frente a variaciones térmicas y dispersión del parámetro $\beta$.

### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Transistor BJT NPN, resistores de base $R_{B1}$ y $R_{B2}$, resistor de colector $R_C$, resistor de emisor $R_E$, fuente de alimentación $V_{CC}$.
* **Conexión exacta:** La fuente $V_{CC}$ se conecta al extremo superior de $R_{B1}$ y de $R_C$. La base del transistor se conecta al nodo central entre $R_{B1}$ y $R_{B2}$. El extremo inferior de $R_{B2}$ va a tierra. El colector del transistor se conecta a $R_C$. El emisor del transistor se conecta al extremo superior de $R_E$, y el extremo inferior de $R_E$ va a tierra.

### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Voltaje de alimentación ($V_{CC}$):** Tensión continua de la fuente.
* **Punto de reposo $Q$ deseado:** Corriente de colector $I_{CQ}$ y voltaje colector-emisor $V_{CEQ}$.
* **Ganancia de corriente ($\,\beta\,$, $h_{fe}$):** Parámetro de amplificación del transistor.
* **Factores de diseño:** $m = R_C / R_E$ (típicamente entre 3 y 10) y $n$ (factor de estabilidad de base, $n \le 0.1$).

### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Región activa:** La unión base-emisor debe estar polarizada en directa ($V_{BE} \approx 0.7\text{ V}$) y la unión base-colector en inversa ($V_{CEQ} > V_{CE,sat} \approx 0.2\text{ V}$).
* **Condición de estabilidad de Thevenin:** Para lograr independencia del punto $Q$ respecto a $\beta$, la resistencia equivalente de base debe cumplir:
  $$R_{TH} = R_{B1} \parallel R_{B2} \le 0.1 \cdot \beta \cdot R_E$$

### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Cálculo de $R_E$:**
   $$R_E = \frac{V_{CC} - V_{CEQ}}{(m + 1) \cdot I_{CQ}}$$
2. **Cálculo de $R_C$:**
   $$R_C = m \cdot R_E$$
3. **Voltaje Thevenin ($V_{TH}$):**
   $$V_{TH} = V_{BE} + I_{CQ} \cdot R_E \cdot \left(1 + \frac{n}{\beta}\right)$$
4. **Resistencia Thevenin ($R_{TH}$):**
   $$R_{TH} = n \cdot \beta \cdot R_E$$
5. **Cálculo de $R_{B1}$ y $R_{B2}$:**
   $$R_{B1} = \frac{V_{CC} \cdot R_{TH}}{V_{TH}} \quad , \quad R_{B2} = \frac{V_{CC} \cdot R_{TH}}{V_{CC} - V_{TH}}$$

### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** $V_{CC} = 16\text{ V}$, $I_{CQ} = 2\text{ mA}$, $V_{CEQ} = 8\text{ V}$, $\beta = 80$, $V_{BE} = 0.7\text{ V}$, $m = 3$, $n = 0.1$.
* **Paso 1 ($R_E$):** $R_E = \frac{16 - 8}{(3 + 1) \cdot 0.002} = \frac{8}{0.008} = 1000\text{ }\Omega \quad (1\text{ k}\Omega)$.
* **Paso 2 ($R_C$):** $R_C = 3 \cdot 1000 = 3000\text{ }\Omega \quad (3\text{ k}\Omega)$.
* **Paso 3 ($V_{TH}$):** $V_{TH} = 0.7 + (0.002) \cdot (1000) \cdot \left(1 + \frac{0.1}{80}\right) \approx 2.7025\text{ V}$.
* **Paso 4 ($R_{TH}$):** $R_{TH} = 0.1 \cdot 80 \cdot 1000 = 8000\text{ }\Omega \quad (8\text{ k}\Omega)$.
* **Paso 5 ($R_{B1}$ y $R_{B2}$):**
  * $R_{B1} = \frac{16 \cdot 8000}{2.7025} \approx 47.36\text{ k}\Omega$.
  * $R_{B2} = \frac{16 \cdot 8000}{16 - 2.7025} \approx 9.62\text{ k}\Omega$.

---

## 3. Circuito Sujetador de Voltaje con Diodo (Cambiador de Nivel / Clamper)

### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Circuito sujetador de tensión con diodo (Cambiador de nivel o *Clamper*).
* **Función principal:** Desplaza de forma vertical la tensión continua (CC) de una señal de corriente alterna (CA) sin modificar su forma de onda ni su amplitud pico a pico ($V_{pp}$). Se utiliza en receptores de TV, sistemas de radar y acondicionamiento de señales.

### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Condensador $C$, diodo de silicio $D$, fuente de referencia continua $V_{ref}$ (opcional) y resistencia de carga $R_L$.
* **Conexión exacta:** La fuente de entrada $v_i$ se conecta en serie con el condensador $C$. El nodo de salida $v_o$ se ubica entre el condensador $C$, el cátodo del diodo $D$ y la resistencia de carga $R_L$. El ánodo de $D$ se conecta al positivo de $V_{ref}$ (cuyo negativo va a tierra) o directamente a tierra si $V_{ref} = 0\text{ V}$. El extremo inferior de $R_L$ se conecta a tierra.

### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Amplitud pico de entrada ($V_m$):** Voltaje pico de la señal de entrada.
* **Periodo de la señal ($T = 1/f$):** Inverso de la frecuencia de trabajo.
* **Nivel de desplazamiento deseado ($V_{ref}$):** Voltaje continuo de referencia.
* **Tensión de umbral del diodo ($V_\gamma \approx 0.7\text{ V}$):** Caída directa del diodo.

### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Constante de tiempo de descarga:** La constante de tiempo debe ser al menos 10 veces el periodo de la señal:
  $$\tau_d = R_L \cdot C \ge 10 T$$
* **Constante de carga rápida:** La resistencia de conducción del diodo debe permitir la carga rápida en el primer semiciclo ($\,\tau_c = R_d \cdot C \ll T/2\,$).

### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Voltaje del condensador ($V_C$):** Durante la conducción directa:
   $$V_C = V_m - V_\gamma + V_{ref}$$
2. **Ecuación de salida:** En régimen dinámico permanente:
   $$v_o(t) = v_i(t) + V_C = v_i(t) + V_m - V_\gamma + V_{ref}$$
3. **Selección de componentes:** Fijar $C$ y calcular $R_L \ge \frac{10}{f \cdot C}$.

### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Entrada senoidal de $V_m = 10\text{ V}$, $f = 1\text{ kHz}$ ($T = 1\text{ ms}$), $V_{ref} = 0\text{ V}$ y $V_\gamma = 0.7\text{ V}$.
* **Paso 1 ($V_C$):** $V_C = 10 - 0.7 + 0 = 9.3\text{ V}$.
* **Paso 2 ($R_L$ y $C$):** Fijando $C = 1\,\mu\text{F}$:
  $$R_L \ge \frac{10 \cdot 10^{-3}}{10^{-6}} = 10000\text{ }\Omega \quad (10\text{ k}\Omega)$$
* **Salida resultante:** Variación de la salida entre $v_{o,min} = -0.7\text{ V}$ y $v_{o,max} = 19.3\text{ V}$.

---

## 4. Circuito Recortador de Voltaje con Diodo (Limitador / Clipper)

### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Circuito recortador de tensión polarizado en paralelo (Limitador o *Clipper*).
* **Función principal:** Elimina o limita las porciones de una forma de onda que excedan un nivel de referencia preestablecido, protegiendo etapas sensibles contra sobrevoltajes.

### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Resistor limitador $R$, diodo de silicio $D$, fuente de referencia continua $V_{CC}$ (o $V_{ref}$) y resistencia de carga $R_L$.
* **Conexión exacta:** La entrada $v_i$ se aplica a la resistencia serie $R$. El nodo de salida $v_o$ se ubica tras $R$. En este nodo se conecta el ánodo de $D$ (recortador positivo); el cátodo de $D$ va al terminal positivo de $V_{CC}$ (cuyo terminal negativo va a tierra). $R_L$ va en paralelo a tierra.

### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Voltaje pico de entrada ($V_m$).**
* **Voltaje de recorte deseado ($V_{recorte}$).**
* **Caída directa del diodo ($V_\gamma \approx 0.7\text{ V}$).**

### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Relación de impedancias:** Para un recorte nítido y sin distorsión fuera de la zona de recorte:
  $$100 R_d < R < 0.01 R_L$$

### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Determinación de $V_{CC}$:**
   $$V_{recorte} = V_{CC} + V_\gamma \implies V_{CC} = V_{recorte} - V_\gamma$$
2. **Estado en corte ($v_i < V_{recorte}$):** $v_o \approx v_i$ (asumiendo $R \ll R_L$).
3. **Estado en conducción ($v_i \ge V_{recorte}$):**
   $$v_o = V_{CC} + V_\gamma + (v_i - V_{CC} - V_\gamma) \cdot \frac{R_d}{R + R_d} \approx V_{CC} + V_\gamma$$

### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Limitar una onda de $V_m = 20\text{ V}$ a $V_{recorte} = 10.7\text{ V}$, con $R_L = 100\text{ k}\Omega$ y $R_d = 10\text{ }\Omega$.
* **Paso 1 ($V_{CC}$):** $V_{CC} = 10.7 - 0.7 = 10\text{ V}$.
* **Paso 2 ($R$):** $1000\text{ }\Omega < R < 1000\text{ }\Omega \implies R = 1\text{ k}\Omega$.
* **Resultado:** Tensión de salida recortada rígidamente a $10.7\text{ V}$.

---

## 5. Filtro Pasa-Altos Activo RC de 1.er Orden (con Amplificador Operacional)

### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Filtro activo paso alto de primer orden RC en configuración no inversora.
* **Función principal:** Atenúa las componentes por debajo de la frecuencia de corte ($f_c$) con una pendiente de $20\text{ dB/década}$, permitiendo el paso de frecuencias superiores con ganancia programable $A \ge 1$ e impedancia de salida cercana a cero.

### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Op-Amp, condensador $C$, resistencia de filtro $R$, resistencias de ganancia $R_1$ y $R_f$.
* **Conexión exacta:** La entrada $v_{in}$ ingresa a $C$. El extremo posterior de $C$ se conecta a la entrada no inversora (+) del Op-Amp y a la resistencia $R$ conectada a tierra. La entrada inversora (-) del Op-Amp se conecta a tierra mediante $R_1$ y a la salida del Op-Amp mediante $R_f$. La salida es la terminal del Op-Amp.

### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Frecuencia de corte ($f_c$).**
* **Ganancia en banda pasante ($A \ge 1$).**
* **Capacitancia comercial ($C$).**

### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Límite de frecuencia superior:** Acotado por el producto Ganancia-Ancho de Banda (GBW) y el *Slew Rate* ($SR$) del amplificador operacional.
* **Ganancia no inversora:** $A = 1 + R_f / R_1 \ge 1$.

### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Selección de $C$:** Escoger valor estándar (ej. $10\text{ nF}$).
2. **Cálculo de $R$:**
   $$R = \frac{1}{2\pi \cdot f_c \cdot C}$$
3. **Cálculo de resistencias de ganancia:**
   $$R_f = (A - 1) \cdot R_1 \quad (\text{fijando } R_1 = 10\text{ k}\Omega)$$
4. **Función de transferencia:**
   $$H(s) = \left(1 + \frac{R_f}{R_1}\right) \cdot \frac{sRC}{1 + sRC}$$

### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** $f_c = 10\text{ kHz}$, ganancia $A = 2$.
* **Paso 1 ($C$):** $C = 10\text{ nF} = 10^{-8}\text{ F}$.
* **Paso 2 ($R$):** $R = \frac{1}{2\pi \cdot 10000 \cdot 10^{-8}} \approx 1.59\text{ k}\Omega$.
* **Paso 3 ($R_1$ y $R_f$):** Con $R_1 = 10\text{ k}\Omega \implies R_f = (2 - 1) \cdot 10\text{ k}\Omega = 10\text{ k}\Omega$.

---

## 6. Divisor de Tensión Resistivo

### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Divisor de tensión pasivo resistivo.
* **Función principal:** Reduce o escala una tensión de entrada continua o alterna a un valor escalar proporcional inferior sin requerir elementos activos.

### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Resistencia superior $R_1$, resistencia inferior $R_2$ (y resistencia de carga $R_L$).
* **Conexión exacta:** La fuente $V_{in}$ se aplica a la parte superior de $R_1$. La unión entre $R_1$ y $R_2$ constituye el nodo de salida $V_{out}$. El extremo inferior de $R_2$ se conecta a tierra. La carga $R_L$ se conecta en paralelo con $R_2$.

### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Voltaje de entrada ($V_{in}$).**
* **Voltaje de salida deseado ($V_{out}$).**
* **Corriente de la rama divisora ($I_{div}$) o disipación máxima.**

### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Atenuación estricta:** $V_{out} < V_{in}$.
* **Regla de carga:** $R_L \ge 10 R_2$ para mantener el error por caída de tensión al conectar la carga por debajo del 5%.

### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Divisor en vacío:**
   $$V_{out} = V_{in} \cdot \frac{R_2}{R_1 + R_2}$$
2. **Resistencia total de la rama:**
   $$R_1 + R_2 = \frac{V_{in}}{I_{div}}$$
3. **Divisor con carga ($R_L$):**
   $$V_{out(carga)} = V_{in} \cdot \frac{R_2 \parallel R_L}{R_1 + (R_2 \parallel R_L)}$$

### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Reducir $V_{in} = 12\text{ V}$ a $V_{out} = 9\text{ V}$ con $R_1 = 1\text{ k}\Omega$.
* **Paso 1 (Vacío):** $9 = 12 \cdot \frac{R_2}{1000 + R_2} \implies R_2 = 3\text{ k}\Omega$.
* **Paso 2 (Con carga $R_L = 30\text{ k}\Omega$):** $R_{eq} = \frac{3 \cdot 30}{3 + 30} = 2.727\text{ k}\Omega$.
  $$V_{out(carga)} = 12 \cdot \frac{2.727}{1 + 2.727} = 8.77\text{ V}$$ (error menor al 2.6%).
