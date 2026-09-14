# Compendio de Fichas de Diseño Teórico de Circuitos Electrónicos Analógicos - Volumen II

Este documento reúne las **Fichas de Diseño Teórico** correspondientes a las 5 categorías avanzadas de la electrónica analógica, siguiendo el formato estándar de caracterización, topología, parámetros de entrada, restricciones, ecuaciones y ejemplo numérico.

---

## 1. Fuentes de Alimentación y Regulación
### CIRCUITO: Fuente de Alimentación de CC Regulada Lineal con Filtro Capacitivo y Diodo Zener

#### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Fuente de alimentación de corriente continua lineal con rectificador de onda completa en puente, filtro capacitivo y regulador paralelo Zener.
* **Función principal:** Transforma la tensión alterna (CA) de la red eléctrica comercial en una tensión continua (CC) constante y regulada frente a variaciones de la carga y de la línea. Se utiliza para energizar circuitos integrados y sistemas analógicos de precisión libres de rizado.

#### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Transformador reductor $T_1$, puente de 4 diodos rectificadores ($D_1, D_2, D_3, D_4$), condensador de filtro $C$, resistor de polarización $R_Z$, diodo Zener $D_Z$ y resistencia de carga $R_L$.
* **Conexión exacta:** 
  1. El primario del transformador $T_1$ se conecta a la toma de CA ($110	ext{ V} / 220	ext{ V}	ext{ rms}$). El secundario entrega una tensión reducida $V_{sec}$.
  2. La salida del secundario se conecta a los nodos de CA del puente de diodos ($D_1-D_4$).
  3. La salida rectificada pulsante (nodos $+$ y $-$ del puente) se conecta en paralelo con el condensador de filtro $C$.
  4. Desde el nodo positivo del condensador se conecta en serie la resistencia de polarización Zener $R_Z$.
  5. El cátodo del diodo Zener $D_Z$ se conecta al extremo posterior de $R_Z$ y al terminal positivo de la carga $R_L$. El ánodo de $D_Z$, la placa negativa de $C$ y el terminal inferior del puente se conectan al nodo común de tierra (GND).

#### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Tensión regulada de salida deseada ($V_{out} = V_Z$):** Tensión de trabajo fija en la carga.
* **Corriente de carga máxima ($I_{L,max}$):** Corriente que demanda la carga conectada.
* **Tensión de entrada en el secundario ($V_{sec,rms}$):** Valor eficaz de la CA del transformador.
* **Rizado pico a pico máximo admitido ($V_{ripple}$):** Variación de tensión máxima tolerada sobre el condensador.
* **Corriente mínima de mantenimiento del Zener ($I_{Z,min}$):** Corriente requerida para garantizar la operación en región de ruptura inversa (típicamente $1	ext{ mA}$ a $5	ext{ mA}$).

#### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Condición de regulación Zener:** Tensión mínima tras el filtro debe superar la tensión Zener ($V_{in,min} > V_Z$).
* **Límite de potencia del Zener:** Con carga desconectada ($I_L = 0$), el diodo Zener absorbe toda la corriente de la rama y debe cumplir $P_Z = V_Z \cdot I_{Z,max} \le P_{Z,nominal}$.
* **Tensión PIV de los diodos:** Cada diodo del puente debe soportar una Tensión Inversa Pico $PIV \ge V_m$.

#### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Cálculo de la tensión pico del filtro ($V_m$):**
   $$V_m = \sqrt{2} \cdot V_{sec,rms} - 2 V_\gamma$$
   *(donde $V_\gamma pprox 0.7	ext{ V}$ es la caída en cada diodo de conducción)*
2. **Cálculo del condensador de filtro ($C$):** Para rectificación de onda completa a frecuencia de red $f_{line}$ ($f_{ripple} = 2 f_{line}$):
   $$C \ge rac{I_{L,max}}{2 \cdot f_{line} \cdot V_{ripple}}$$
3. **Tensión mínima de entrada al regulador ($V_{in,min}$):**
   $$V_{in,min} = V_m - V_{ripple}$$
4. **Cálculo de la resistencia de polarización Zener ($R_Z$):**
   $$R_Z = rac{V_{in,min} - V_Z}{I_{Z,min} + I_{L,max}}$$

#### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Diseñar una fuente regulada de $V_Z = 9	ext{ V}$ para entregar $I_{L,max} = 50	ext{ mA}$ desde un transformador de $V_{sec,rms} = 12	ext{ V}$ a $f_{line} = 60	ext{ Hz}$ ($f_{ripple} = 120	ext{ Hz}$), fijando $V_{ripple} = 1.5	ext{ V}$ e $I_{Z,min} = 5	ext{ mA}$.
* **Paso 1 ($V_m$):**
  $$V_m = \sqrt{2} \cdot 12 - 2(0.7) = 16.97 - 1.4 = 15.57	ext{ V}$$
* **Paso 2 ($C$):**
  $$C \ge rac{0.050}{2 \cdot 60 \cdot 1.5} = rac{0.050}{180} pprox 277.7\,\mu	ext{F} \quad \implies 	ext{Comercial: } 330\,\mu	ext{F}$$
* **Paso 3 ($V_{in,min}$):**
  $$V_{in,min} = 15.57 - 1.5 = 14.07	ext{ V}$$
* **Paso 4 ($R_Z$):**
  $$R_Z = rac{14.07 - 9}{0.005 + 0.050} = rac{5.07}{0.055} pprox 92.18\,\Omega \quad \implies 	ext{Comercial: } 91\,\Omega 	ext{ o } 100\,\Omega$$

---

## 2. Circuitos con Diodos y Conformación de Onda
### CIRCUITO: Recortador de Voltaje Polarizado en Paralelo a Dos Niveles (Slicer / Limitador Simétrico)

#### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Circuito recortador de tensión de doble nivel polarizado en paralelo (Rebanador de amplitud o *Double-ended Clipper*).
* **Función principal:** Limita simétricamente o asimétricamente los picos positivos y negativos de una señal de CA cuando sobrepasan dos niveles de tensión de referencia preestablecidos ($V_{ref1}$ y $-V_{ref2}$). Protege etapas de entrada contra sobrevoltajes y convierte ondas senoidales en ondas cuasi-cuadradas.

#### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Resistor limitador de entrada $R$, dos diodos de silicio ($D_1, D_2$), dos fuentes de polarización continua ($V_1, V_2$) y resistencia de carga $R_L$.
* **Conexión exacta:** 
  1. La señal de entrada $v_i$ se aplica a un terminal de la resistencia serie $R$.
  2. El otro terminal de $R$ se conecta al nodo de salida $v_o$.
  3. En dicho nodo se conectan en paralelo dos ramas a tierra:
     * **Rama Positiva:** Ánodo de $D_1$ al nodo de salida; cátodo de $D_1$ al polo positivo de $V_1$; polo negativo de $V_1$ a tierra.
     * **Rama Negativa:** Cátodo de $D_2$ al nodo de salida; ánodo de $D_2$ al polo negativo de $V_2$; polo positivo de $V_2$ a tierra.
  4. La carga $R_L$ se conecta en paralelo con ambas ramas a tierra.

#### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Amplitud pico de entrada ($V_m$):** Voltaje máximo de la señal senoidal o triangular de entrada.
* **Nivel de recorte positivo deseado ($V_{clip,+}$):** Tensión límite superior de la salida.
* **Nivel de recorte negativo deseado ($V_{clip,-}$):** Tensión límite inferior de la salida.
* **Resistencia de carga ($R_L$):** Impedancia de la etapa posterior.

#### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Criterio de impedancia limitadora:** Para garantizar un recorte nítido en conducción y mínima atenuación en zona lineal:
  $$100 \cdot R_d < R < 0.01 \cdot R_L$$
  *(donde $R_d pprox 10\,\Omega$ es la resistencia interna del diodo en conducción)*.
* **Independencia de los diodos:** Ambas ramas deben cumplir $V_1 + V_\gamma > -(V_2 + V_\gamma)$ para evitar conducción simultánea no deseada.

#### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Determinación de la fuente de CC positiva ($V_1$):**
   $$V_1 = V_{clip,+} - V_\gamma$$
2. **Determinación de la fuente de CC negativa ($V_2$):**
   $$V_2 = |V_{clip,-}| - V_\gamma$$
3. **Selección del resistor serie ($R$):**
   $$R = \sqrt{100 R_d \cdot 0.01 R_L}$$
4. **Ecuación de la curva de transferencia $v_o$ vs $v_i$:**
   $$egin{cases}
   v_o = V_1 + V_\gamma & 	ext{si } v_i \ge V_1 + V_\gamma \
   v_o pprox v_i & 	ext{si } -(V_2 + V_\gamma) < v_i < V_1 + V_\gamma \
   v_o = -(V_2 + V_\gamma) & 	ext{si } v_i \le -(V_2 + V_\gamma)
   \end{cases}$$

#### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Recortar una señal senoidal de $V_m = 15	ext{ V}$ a un máximo positivo de $V_{clip,+} = +5.7	ext{ V}$ y un mínimo negativo de $V_{clip,-} = -3.7	ext{ V}$, trabajando con una carga $R_L = 100	ext{ k}\Omega$ y diodos con $V_\gamma = 0.7	ext{ V}, R_d = 10\,\Omega$.
* **Paso 1 ($V_1$):**
  $$V_1 = 5.7 - 0.7 = 5.0	ext{ V}$$
* **Paso 2 ($V_2$):**
  $$V_2 = |-3.7| - 0.7 = 3.0	ext{ V}$$
* **Paso 3 ($R$):**
  $$100(10) < R < 0.01(100000) \implies 1000\,\Omega < R < 1000\,\Omega \implies R = 1	ext{ k}\Omega$$
* **Resultado:** La salida $v_o$ queda acotada rígidamente en el intervalo $[-3.7	ext{ V}, +5.7	ext{ V}]$.

---

## 3. Amplificación y Polarización con Transistores (BJT / MOSFET)
### CIRCUITO: Amplificador Monotapa BJT en Configuración Emisor Común con Desacople de Emisor

#### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Amplificador de señal pequeña con transistor BJT NPN en configuración Emisor Común con red de polarización por divisor de tensión y condensador de desacople de emisor.
* **Función principal:** Proporciona elevadas ganancias de tensión y corriente en corriente alterna (CA) invirtiendo la fase de la señal $180^\circ$. Es la etapa fundamental en preamplificadores de audio e instrumentación.

#### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Transistor BJT NPN, resistores $R_{B1}, R_{B2}, R_C, R_E$, condensadores de acoplamiento $C_{in}, C_{out}$, condensador de desacople $C_E$, fuente de alimentación $V_{CC}$ y resistencia de carga $R_L$.
* **Conexión exacta:** 
  1. $V_{CC}$ al extremo superior de $R_{B1}$ y de $R_C$.
  2. Divisor $R_{B1}-R_{B2}$ conectado a la Base del transistor. $R_{B2}$ va a tierra.
  3. Condensador $C_{in}$ entre la fuente de entrada $v_i$ y la Base.
  4. Colector al extremo inferior de $R_C$ y a la placa izquierda de $C_{out}$. La placa derecha de $C_{out}$ va a la carga $R_L$ conectada a tierra.
  5. Emisor conectado a $R_E$. En paralelo con $R_E$ se conecta el condensador $C_E$ a tierra para cortocircuitar la resistencia en CA.

#### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Voltaje de alimentación ($V_{CC}$):** Tensión continua disponible.
* **Punto de reposo $Q$ ($I_{CQ}, V_{CEQ}$):** Definido típicamente en $V_{CEQ} pprox V_{CC}/2$ para maximizar el rango dinámico sin simetría de recorte.
* **Ganancia de tensión en CA deseada ($A_v$):** Proporción entre $v_o$ y $v_i$.
* **Frecuencia límite inferior ($f_{low}$):** Frecuencia de corte mínima de banda pasante.
* **Parámetros del BJT:** Ganancia $eta$ ($h_{fe}$) y $V_{BE} pprox 0.7	ext{ V}$.

#### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Criterio de estabilidad de polarización:** $R_{TH} = R_{B1} \parallel R_{B2} \le 0.1 \cdot eta \cdot R_E$.
* **Desacople efectivo en CA:** La reactancia de $C_E$ a la frecuencia mínima $f_{low}$ debe ser mucho menor que la resistencia interna de emisor ($X_{CE} \le 0.1 \cdot r_e$).

#### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Cálculo de $R_E$ y $R_C$ en CC:** Asumiendo caída en emisor $V_E pprox 0.1 \cdot V_{CC}$:
   $$R_E = rac{0.1 \cdot V_{CC}}{I_{CQ}} \quad , \quad R_C = rac{V_{CC} - V_{CEQ} - V_E}{I_{CQ}}$$
2. **Cálculo de la resistencia interna de emisor en CA ($r_e$):**
   $$r_e = rac{V_T}{I_{CQ}} pprox rac{26	ext{ mV}}{I_{CQ}}$$
3. **Verificación de la Ganancia de Tensión en CA ($A_v$):**
   $$A_{vL} = -rac{R_C \parallel R_L}{r_e}$$
4. **Cálculo de la red de base ($R_{B1}, R_{B2}$):**
   $$V_{TH} = V_{BE} + V_E = 0.7 + 0.1 V_{CC} \quad , \quad R_{TH} = 0.1 \cdot eta \cdot R_E$$
   $$R_{B1} = rac{V_{CC} \cdot R_{TH}}{V_{TH}} \quad , \quad R_{B2} = rac{V_{CC} \cdot R_{TH}}{V_{CC} - V_{TH}}$$
5. **Dimensionamiento del condensador de desacople ($C_E$):**
   $$C_E \ge rac{1}{2\pi \cdot f_{low} \cdot (r_e \parallel R_E)}$$

#### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** $V_{CC} = 12	ext{ V}, I_{CQ} = 2	ext{ mA}, V_{CEQ} = 6	ext{ V}, eta = 100, R_L = 10	ext{ k}\Omega, f_{low} = 20	ext{ Hz}$.
* **Paso 1 ($R_E, R_C$):**
  $$V_E = 0.1(12) = 1.2	ext{ V} \implies R_E = rac{1.2}{0.002} = 600\,\Omega \quad (	ext{Comercial: } 620\,\Omega)$$
  $$R_C = rac{12 - 6 - 1.2}{0.002} = rac{4.8}{0.002} = 2400\,\Omega \quad (2.4	ext{ k}\Omega)$$
* **Paso 2 ($r_e$ y $A_v$):**
  $$r_e = rac{26	ext{ mV}}{2	ext{ mA}} = 13\,\Omega \implies A_{vL} = -rac{2400 \parallel 10000}{13} = -rac{1935.5}{13} pprox -148.8$$
* **Paso 3 ($R_{B1}, R_{B2}$):**
  $$V_{TH} = 0.7 + 1.2 = 1.9	ext{ V} \quad , \quad R_{TH} = 0.1(100)(600) = 6000\,\Omega \quad (6	ext{ k}\Omega)$$
  $$R_{B1} = rac{12 \cdot 6000}{1.9} pprox 37.89	ext{ k}\Omega \quad , \quad R_{B2} = rac{12 \cdot 6000}{12 - 1.9} pprox 7.12	ext{ k}\Omega$$
* **Paso 4 ($C_E$):**
  $$C_E \ge rac{1}{2\pi \cdot 20 \cdot 13} = rac{1}{1633.6} pprox 612\,\mu	ext{F} \quad (	ext{Comercial: } 1000\,\mu	ext{F})$$

---

## 4. Etapas Lineales con Amplificadores Operacionales
### CIRCUITO: Amplificador Integrador Analógico Práctico (con Resistencia de Limitación en CC)

#### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Integrador lineal práctico compensado en ganancia continua mediante amplificador operacional.
* **Función principal:** Genera una tensión de salida proporcional a la integral en el tiempo de la tensión de entrada ($v_o(t) \propto \int v_in(t) dt$). Modifica formas de onda (convierte ondas cuadradas en triangulares y triangulares en senoidales). Se utiliza en filtros analógicos, generadores de funciones y computadores analógicos.

#### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Amplificador Operacional (Op-Amp), resistor de entrada $R_{in}$, condensador de realimentación $C_f$ y resistor de realimentación en paralelo $R_f$.
* **Conexión exacta:** 
  1. La fuente de entrada $v_{in}$ se conecta a través del resistor $R_{in}$ al nodo inversor (-) del Op-Amp.
  2. La entrada no inversora (+) se conecta directamente a tierra de referencia (GND).
  3. Entre el nodo inversor (-) y la salida del Op-Amp se conecta en paralelo la red formada por el condensador $C_f$ y el resistor $R_f$.

#### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Frecuencia crítica de integración ($f_{int}$):** Frecuencia a partir de la cual el circuito realiza la operación matemática de integración de forma precisa.
* **Ganancia en corriente continua máxima ($A_{dc}$):** Límite de amplificación de voltaje para componentes estáticas o de muy baja frecuencia.
* **Amplitud de la señal de entrada ($V_{in,p}$):** Voltaje pico de la señal de CA a integrar.

#### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Prevención de saturación por Offset:** Un integrador ideal ($R_f 	o \infty$) acumula cualquier pequeña corriente de offset de entrada o componente continua en $C_f$, saturando la salida hacia $+V_{sat}$ o $-V_{sat}$. El resistor $R_f$ es obligatorio en aplicaciones prácticas para limitar la ganancia en CC ($A_{dc} = R_f / R_{in}$).
* **Rango de integración precisa:** La frecuencia de la señal de entrada debe ser superior a la frecuencia de corte del lazo: $f_{signal} \ge 10 \cdot f_c = rac{10}{2\pi R_f C_f}$.

#### 5. ECUACIONES DE DISEÑO PASO A PASO
1. **Selección del condensador de realimentación ($C_f$):** Elegir un valor comercial de alta precisión (poliéster o milar, ej. $10	ext{ nF}$ a $100	ext{ nF}$).
2. **Cálculo del resistor de entrada ($R_{in}$):** Define la constante de tiempo de integración $	au = R_{in} \cdot C_f$:
   $$R_{in} = rac{1}{2\pi \cdot f_{int} \cdot C_f}$$
3. **Cálculo del resistor de realimentación ($R_f$):** Fija la ganancia máxima en CC (se recomienda $R_f pprox 10 \cdot R_{in}$):
   $$R_f = A_{dc} \cdot R_{in}$$
4. **Respuesta en el dominio del tiempo en banda de integración ($f \gg f_c$):**
   $$v_o(t) = -rac{1}{R_{in} C_f} \int_{0}^{t} v_{in}(t) dt + v_o(0)$$

#### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Diseñar un integrador para procesar señales cuadradas a partir de $f_{int} = 1	ext{ kHz}$, limitando la ganancia en CC a $A_{dc} = 10$, utilizando $C_f = 10	ext{ nF}$.
* **Paso 1 ($R_{in}$):**
  $$R_{in} = rac{1}{2\pi \cdot (1000) \cdot (10 	imes 10^{-9})} = rac{1}{6.283 	imes 10^{-5}} pprox 15.91	ext{ k}\Omega \quad (	ext{Comercial: } 16	ext{ k}\Omega)$$
* **Paso 2 ($R_f$):**
  $$R_f = 10 \cdot 15.91	ext{ k}\Omega pprox 159.1	ext{ k}\Omega \quad (	ext{Comercial: } 160	ext{ k}\Omega)$$
* **Paso 3 (Frecuencia de corte $f_c$):**
  $$f_c = rac{1}{2\pi \cdot (160000) \cdot (10 	imes 10^{-9})} pprox 99.47	ext{ Hz}$$
  *(Garantiza integración precisa para cualquier frecuencia superior a $1	ext{ kHz}$)*.

---

## 5. Filtros Activos de Segundo Orden (VCVS / Sallen-Key)
### CIRCUITO: Filtro Pasa-Bajos Activo de 2.º Orden Topología Sallen-Key (Aproximación Butterworth / VCVS)

#### 1. IDENTIFICACIÓN Y DESCRIPCIÓN
* **Nombre formal:** Filtro activo paso bajo de segundo orden Sallen-Key en configuración de Fuente de Tensión Controlada por Tensión (VCVS) con respuesta máximamente plana (Butterworth).
* **Función principal:** Atenúa frecuencias superiores a la frecuencia de corte $f_o$ con una pendiente de $-40	ext{ dB/década}$ ($-12	ext{ dB/octava}$), manteniendo una ganancia uniforme en la banda pasante sin rizado. Se utiliza en etapas anti-aliasing y procesado de audio.

#### 2. ESQUEMA DE CONEXIÓN DE COMPONENTES (Topología)
* **Lista de componentes:** Op-Amp, resistores de filtro $R_1, R_2$, condensadores de filtro $C_1, C_2$, e opcionalmente resistores de ganancia $R_A, R_B$.
* **Conexión exacta:** 
  1. La señal de entrada $v_{in}$ se conecta a $R_1$. El otro extremo de $R_1$ va al nodo intermedio $N_1$.
  2. Desde el nodo $N_1$, $R_2$ se conecta a la entrada no inversora (+) del Op-Amp.
  3. El condensador $C_1$ se conecta entre el nodo $N_1$ y la salida del Op-Amp (realimentación positiva).
  4. El condensador $C_2$ se conecta entre la entrada no inversora (+) y tierra.
  5. Para ganancia unitaria ($K=1$), la salida del Op-Amp se conecta directamente a su entrada inversora (-).

#### 3. PARÁMETROS DE ENTRADA (Especificaciones de diseño)
* **Frecuencia de corte deseada ($f_o$ o $\omega_o$):** Frecuencia de atenuación a $-3	ext{ dB}$.
* **Factor de Calidad ($Q$):** Para respuesta plana Butterworth de 2.º orden, $Q = 1/\sqrt{2} pprox 0.707$.
* **Ganancia en banda pasante ($K$):** Ganancia en CC (típicamente $K = 1$).

#### 4. RESTRICCIONES Y CONDICIONES DE OPERACIÓN
* **Condición de estabilidad de ganancia:** En la topología Sallen-Key con resistores iguales, la ganancia $K$ debe ser estrictamente menor a 3 ($K < 3$) para evitar oscilaciones inestables ($Q 	o \infty$).
* **Sensibilidad de componentes:** La selección de capacitores de igual valor o relación fija de componentes determina la dispersión del factor $Q$.

#### 5. ECUACIONES DE DISEÑO PASO A PASO (Para $K=1, R_1 = R_2 = R$)
1. **Selección del condensador $C_1$:** Escoger un valor estándar comercial.
2. **Cálculo del condensador $C_2$ para respuesta Butterworth ($Q = 0.707$):**
   $$C_2 = rac{C_1}{4 \cdot Q^2} = rac{C_1}{4 \cdot (0.707)^2} = rac{C_1}{2}$$
3. **Cálculo del valor de las resistencias iguales ($R_1 = R_2 = R$):**
   $$f_o = rac{1}{2\pi R \sqrt{C_1 C_2}} \implies R = rac{1}{2\pi \cdot f_o \cdot \sqrt{C_1 C_2}}$$
4. **Función de Transferencia completa:**
   $$H(s) = rac{K \cdot \omega_o^2}{s^2 + rac{\omega_o}{Q} s + \omega_o^2} = rac{1}{s^2 R^2 C_1 C_2 + s R C_2 \cdot 2 + 1}$$

#### 6. EJEMPLO NUMÉRICO DE DISEÑO
* **Especificaciones:** Diseñar un filtro pasa-bajos activo Sallen-Key de 2.º orden Butterworth con $f_o = 5	ext{ kHz}$ y ganancia $K = 1$.
* **Paso 1 (Selección de $C_1$):** Se fija $C_1 = 10	ext{ nF}$.
* **Paso 2 (Cálculo de $C_2$):**
  $$C_2 = rac{10	ext{ nF}}{2} = 5	ext{ nF} \quad (	ext{Comercial: } 4.7	ext{ nF} 	ext{ o dos de } 10	ext{ nF} 	ext{ en serie})$$
  *(Utilizando $C_2 = 4.7	ext{ nF}$ para valores comerciales)*.
* **Paso 3 (Cálculo de $R$):**
  $$\sqrt{C_1 C_2} = \sqrt{(10 	imes 10^{-9}) \cdot (4.7 	imes 10^{-9})} = \sqrt{4.7 	imes 10^{-17}} pprox 6.855 	imes 10^{-9}	ext{ F}$$
  $$R = rac{1}{2\pi \cdot (5000) \cdot (6.855 	imes 10^{-9})} = rac{1}{2.1536 	imes 10^{-4}} pprox 4643\,\Omega \quad (	ext{Comercial: } 4.7	ext{ k}\Omega)$$
* **Verificación de frecuencia real:**
  $$f_o = rac{1}{2\pi \cdot 4700 \cdot 6.855 	imes 10^{-9}} pprox 4940	ext{ Hz} \quad (	ext{Error } < 1.2\%)$$

---
*Compendio elaborado en conformidad estricta con las leyes de redes analógicas, teoría de semiconductores y filtros de frecuencia.*
