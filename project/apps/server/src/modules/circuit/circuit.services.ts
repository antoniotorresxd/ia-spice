import { eq } from "drizzle-orm";

import { db } from "@/db";

import { circuitKnowledge, type CircuitKnowledge } from "./circuit.model";
import type { CreateCircuitKnowledgeInput } from "./circuit.schemas";

export const INITIAL_CIRCUITS_SEED: CreateCircuitKnowledgeInput[] = [
  {
    id: "rc_lowpass_passive",
    name: "Filtro Pasa-Bajos Pasivo RC de 1.er Orden",
    category: "filtros",
    description:
      "Atenúa componentes de alta frecuencia por encima de la frecuencia de corte (f_c) a -20 dB/década. Usado para eliminación de ruido, anti-aliasing y suavizado.",
    topologySummary:
      "Fuente de entrada en serie con resistencia R. Condensador C conectado entre el nodo de salida (vout) y tierra (0).",
    parametersSchema: {
      f_c: {
        type: "number",
        unit: "Hz",
        description: "Frecuencia de corte deseada (-3 dB)",
        required: true,
      },
      c: {
        type: "number",
        unit: "F",
        description: "Valor del condensador comercial",
        default: 1e-8,
        required: false,
      },
    },
    operatingConstraints:
      "Resistencia de carga R_L >= 10*R para no alterar la frecuencia de corte. Pendiente -20 dB/década.",
    designEquations:
      "1. Fijar C comercial (ej. 10 nF).\n2. R = 1 / (2 * pi * f_c * C).\n3. H(s) = 1 / (1 + s*R*C).",
    spiceTemplate: `* RC Lowpass Filter
Vin vin 0 DC 0 AC 1
R1 vin vout {R}
C1 vout 0 {C}
.control
ac dec 100 1 1e9
meas ac fc WHEN vdb(vout)=-3.0103
echo $&fc > output.txt
.endc
.end`,
    numericalExample: {
      specs: { f_c: 10000, C: 1e-8 },
      computed: { R: 1591.55, C: 1e-8 },
      expected: { fc: 10000 },
    },
  },
  {
    id: "bjt_voltage_divider",
    name: "Polarización por Divisor de Voltaje en BJT (Emisor Común)",
    category: "polarizacion_bjt",
    description:
      "Fija un punto de operación Q (I_CQ, V_CEQ) estable frente a variaciones de temperatura y dispersión de beta en transistores BJT.",
    topologySummary:
      "Divisor RB1 y RB2 en base; RC en colector conectado a VCC; RE en emisor a tierra. Transistor NPN (Q1).",
    parametersSchema: {
      v_cc: {
        type: "number",
        unit: "V",
        description: "Voltaje de alimentación continuo",
        required: true,
      },
      i_cq: {
        type: "number",
        unit: "A",
        description: "Corriente de colector deseada en el punto Q",
        required: true,
      },
      v_ceq: {
        type: "number",
        unit: "V",
        description: "Voltaje colector-emisor deseado en el punto Q",
        required: true,
      },
      beta: {
        type: "number",
        description: "Ganancia de corriente del transistor BJT",
        default: 100,
        required: false,
      },
      m: {
        type: "number",
        description: "Relación RC / RE (típicamente 3 a 10)",
        default: 3,
        required: false,
      },
      n: {
        type: "number",
        description: "Factor de estabilidad de base (n <= 0.1)",
        default: 0.1,
        required: false,
      },
    },
    operatingConstraints:
      "Región activa: V_BE ~= 0.7V, V_CEQ > 0.2V. Estabilidad: R_TH = RB1 || RB2 <= 0.1 * beta * RE.",
    designEquations:
      "1. RE = (VCC - V_CEQ) / ((m + 1) * I_CQ)\n2. RC = m * RE\n3. V_TH = V_BE + I_CQ * RE * (1 + n/beta)\n4. R_TH = n * beta * RE\n5. RB1 = VCC * R_TH / V_TH\n6. RB2 = VCC * R_TH / (VCC - V_TH)",
    spiceTemplate: `* BJT Common Emitter Voltage Divider Bias
VCC vcc 0 DC {VCC}
RB1 vcc vb {RB1}
RB2 vb 0 {RB2}
RC vcc vc {RC}
RE ve 0 {RE}
Q1 vc vb ve NPN_MODEL
.model NPN_MODEL NPN(BF={beta})
.control
op
let vceq = v(vc) - v(ve)
let icq = -i(VCC) - (v(vcc) - v(vb))/{RB1}
echo $&vceq > output.txt
.endc
.end`,
    numericalExample: {
      specs: { v_cc: 16, i_cq: 0.002, v_ceq: 8, beta: 80, m: 3, n: 0.1 },
      computed: { RE: 1000, RC: 3000, RB1: 47360, RB2: 9620 },
      expected: { v_ceq: 8, i_cq: 0.002 },
    },
  },
  {
    id: "diode_clamper",
    name: "Circuito Sujetador de Voltaje con Diodo (Clamper)",
    category: "diodos",
    description:
      "Desplaza verticalmente el nivel continuo de una señal periódica sin alterar su forma de onda ni su amplitud pico a pico.",
    topologySummary:
      "Entrada conectada a condensador serie C; diodo D en paralelo a tierra o a fuente Vref; resistencia RL en paralelo.",
    parametersSchema: {
      v_m: {
        type: "number",
        unit: "V",
        description: "Amplitud pico de la señal de entrada",
        required: true,
      },
      freq: {
        type: "number",
        unit: "Hz",
        description: "Frecuencia de la señal alterna de entrada",
        required: true,
      },
      v_ref: {
        type: "number",
        unit: "V",
        description: "Nivel de desplazamiento continuo deseado",
        default: 0,
        required: false,
      },
    },
    operatingConstraints:
      "tau_descarga = RL * C >= 10 * T (donde T = 1/f). Carga rápida a través del diodo.",
    designEquations:
      "1. VC = V_m - V_gamma + V_ref (con V_gamma ~= 0.7V).\n2. Seleccionar C (ej. 1 uF).\n3. RL >= 10 / (freq * C).\n4. vo(t) = vi(t) + VC.",
    spiceTemplate: `* Diode Clamper Circuit
Vin vin 0 SIN(0 {Vm} {freq})
C1 vin vout {C}
D1 0 vout DIODE_1N4148
RL vout 0 {RL}
.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)
.control
tran {tstep} {tstop} {tstart}
meas tran vomax MAX v(vout) from={tstart} to={tstop}
echo $&vomax > output.txt
.endc
.end`,
    numericalExample: {
      specs: { v_m: 10, freq: 1000, v_ref: 0 },
      computed: { C: 1e-6, RL: 10000, VC: 9.3 },
      expected: { vomax: 19.3 },
    },
  },
  {
    id: "diode_clipper",
    name: "Circuito Recortador de Voltaje con Diodo (Clipper)",
    category: "diodos",
    description:
      "Elimina o limita las porciones de la forma de onda que superan un nivel de referencia fijado para protección contra sobrevoltaje.",
    topologySummary:
      "Resistencia serie R entre vin y vout. Diodo D en serie con fuente Vbias en derivación hacia tierra. Carga RL en paralelo.",
    parametersSchema: {
      v_m: {
        type: "number",
        unit: "V",
        description: "Amplitud pico de la señal de entrada",
        required: true,
      },
      v_recorte: {
        type: "number",
        unit: "V",
        description: "Nivel máximo de recorte deseado a la salida",
        required: true,
      },
    },
    operatingConstraints:
      "100 * Rd < R < 0.01 * RL para asegurar corte limpio sin atenuar la señal por debajo del umbral.",
    designEquations:
      "1. Vbias = V_recorte - V_gamma (con V_gamma ~= 0.7V).\n2. Seleccionar R tal que Rd << R << RL.\n3. Salida recortada rígidamente a V_recorte.",
    spiceTemplate: `* Diode Clipper Circuit
Vin vin 0 SIN(0 {Vm} 1000)
R1 vin vout {R}
D1 vout vbias DIODE_1N4148
Vbias vbias 0 DC {Vbias}
RL vout 0 {RL}
.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)
.control
tran 1u 5m 3m
meas tran vclip MAX v(vout) from=3m to=5m
echo $&vclip > output.txt
.endc
.end`,
    numericalExample: {
      specs: { v_m: 20, v_recorte: 10.7 },
      computed: { Vbias: 10.0, R: 1000, RL: 100000 },
      expected: { vclip: 10.7 },
    },
  },
  {
    id: "opamp_highpass_active",
    name: "Filtro Pasa-Altos Activo RC de 1.er Orden (Op-Amp)",
    category: "opamp",
    description:
      "Atenúa frecuencias por debajo de f_c a +20 dB/década y permite el paso de frecuencias superiores con ganancia A >= 1 e impedancia de salida baja.",
    topologySummary:
      "Red RC serie en entrada no inversora (+): condensador C de entrada, resistencia R a tierra. Amplificador no inversor con R1 a tierra y Rf en realimentación negativa.",
    parametersSchema: {
      f_c: {
        type: "number",
        unit: "Hz",
        description: "Frecuencia de corte (-3 dB)",
        required: true,
      },
      gain: {
        type: "number",
        description: "Ganancia en banda de paso (A >= 1)",
        default: 2,
        required: false,
      },
      c: {
        type: "number",
        unit: "F",
        description: "Valor comercial del condensador",
        default: 1e-8,
        required: false,
      },
    },
    operatingConstraints:
      "Ganancia A = 1 + Rf / R1 >= 1. Acotado por GBW y Slew Rate del amplificador operacional.",
    designEquations:
      "1. Fijar C comercial (ej. 10 nF).\n2. R = 1 / (2 * pi * f_c * C).\n3. Fijar R1 = 10k; Rf = (gain - 1) * R1.\n4. H(s) = (1 + Rf/R1) * (s*R*C) / (1 + s*R*C).",
    spiceTemplate: `* Active Highpass RC Filter
Vin vin 0 DC 0 AC 1
C1 vin vplus {C}
R1 vplus 0 {R}
X1 vplus vfb vout opamp
Rg vfb 0 {R1}
Rf vout vfb {Rf}

.subckt opamp inp inn out
Rin inp inn 1e6
Egain n1 0 inp inn 1e5
Rp n1 n2 1k
Cp n2 0 159n
Eout out 0 n2 0 1
.ends

.control
ac dec 100 1 1e9
meas ac gpass FIND vdb(vout) AT=1e6
let g_3db = gpass - 3.0103
meas ac fc WHEN vdb(vout)=g_3db
echo $&fc > output.txt
.endc
.end`,
    numericalExample: {
      specs: { f_c: 10000, gain: 2, c: 1e-8 },
      computed: { R: 1591.55, C: 1e-8, R1: 10000, Rf: 10000 },
      expected: { fc: 10000 },
    },
  },
  {
    id: "opamp_noninverting_amp",
    name: "Amplificador No Inversor con Op-Amp",
    category: "opamp",
    description:
      "Amplifica una señal continua o alterna sin inversión de fase con ganancia de voltaje A = 1 + Rf / Rg.",
    topologySummary:
      "Entrada Vin a terminal no inversor (+); divisor de realimentación Rf-Rg entre vout, terminal inversor (-) y tierra.",
    parametersSchema: {
      v_in: {
        type: "number",
        unit: "V",
        description: "Voltaje de entrada",
        required: true,
      },
      v_out: {
        type: "number",
        unit: "V",
        description: "Voltaje deseado de salida (>= v_in)",
        required: true,
      },
      rg: {
        type: "number",
        unit: "Ohm",
        description: "Resistencia de referencia a tierra Rg",
        default: 1000,
        required: false,
      },
    },
    operatingConstraints: "v_out >= v_in (ganancia no inversora A >= 1).",
    designEquations: "Rg = 1000. Rf = (v_out / v_in - 1) * Rg.",
    spiceTemplate: `* Noninverting Op-Amp Amplifier
Vin vin 0 DC {v_in}
R1 vout vfb {Rf}
R2 vfb 0 {Rg}
X1 vin vfb vout opamp
.subckt opamp inp inn out
Rin inp inn 1e6
Egain n1 0 inp inn 1e5
Rp n1 n2 1k
Cp n2 0 159n
Eout out 0 n2 0 1
.ends
.control
op
wrdata output.txt v(vout)
.endc
.end`,
    numericalExample: {
      specs: { v_in: 1.0, v_out: 3.0 },
      computed: { Rg: 1000, Rf: 2000 },
      expected: { v_out: 3.0 },
    },
  },
  {
    id: "voltage_divider",
    name: "Divisor de Tensión Resistivo",
    category: "divisores",
    description:
      "Escala una tensión de entrada continua o alterna a un valor proporcional inferior usando resistores pasivos.",
    topologySummary:
      "Resistencia superior R1 conectada a Vin y vout. Resistencia inferior R2 conectada entre vout y tierra.",
    parametersSchema: {
      v_in: {
        type: "number",
        unit: "V",
        description: "Voltaje de entrada",
        required: true,
      },
      v_out: {
        type: "number",
        unit: "V",
        description: "Voltaje de salida deseado (debe ser menor a v_in)",
        required: true,
      },
      r1: {
        type: "number",
        unit: "Ohm",
        description: "Valor de la resistencia superior R1",
        default: 1000,
        required: false,
      },
    },
    operatingConstraints:
      "V_out < V_in. Si se conecta carga RL, debe cumplir RL >= 10*R2 para error < 5%.",
    designEquations:
      "1. V_out = V_in * (R2 / (R1 + R2))\n2. R2 = R1 * V_out / (V_in - V_out)\n3. Con carga RL: V_out(carga) = V_in * (R2 || RL) / (R1 + (R2 || RL)).",
    spiceTemplate: `* Resistive Voltage Divider
Vin vin 0 DC {Vin}
R1 vin vout {R1}
R2 vout 0 {R2}
.control
op
wrdata output.txt v(vout)
.endc
.end`,
    numericalExample: {
      specs: { v_in: 12, v_out: 9, r1: 1000 },
      computed: { R1: 1000, R2: 3000 },
      expected: { vout: 9 },
    },
  },
  {
    id: "zener_regulated_power_supply",
    name: "Fuente de Alimentación Regulada Lineal con Zener",
    category: "fuentes_reguladas",
    description:
      "Transforma tensión alterna de red en continua constante y regulada mediante puente rectificador, filtro capacitivo y regulador Zener.",
    topologySummary:
      "Transformador T1 conectado a puente D1-D4; filtro C en paralelo; resistencia de polarización RZ en serie; diodo Zener DZ en paralelo con la carga RL a tierra.",
    parametersSchema: {
      v_z: {
        type: "number",
        unit: "V",
        description: "Tensión regulada deseada de salida (VZ)",
        required: true,
      },
      i_l_max: {
        type: "number",
        unit: "A",
        description: "Corriente máxima de carga",
        required: true,
      },
      v_sec_rms: {
        type: "number",
        unit: "V",
        description: "Tensión eficaz del secundario del transformador",
        required: true,
      },
      v_ripple: {
        type: "number",
        unit: "V",
        description: "Rizado pico a pico máximo tolerado sobre el condensador",
        default: 1.5,
        required: false,
      },
      f_line: {
        type: "number",
        unit: "Hz",
        description: "Frecuencia de la red eléctrica",
        default: 60,
        required: false,
      },
      i_z_min: {
        type: "number",
        unit: "A",
        description: "Corriente mínima de mantenimiento del Zener",
        default: 0.005,
        required: false,
      },
    },
    operatingConstraints:
      "Vin,min = Vm - Vripple > VZ. Potencia Zener: PZ = VZ * (IZ,min + IL,max) <= PZ,nominal. PIV >= Vm.",
    designEquations:
      "1. Vm = sqrt(2)*V_sec_rms - 2*0.7\n2. C >= IL,max / (2 * f_line * V_ripple)\n3. Vin,min = Vm - V_ripple\n4. RZ = (Vin,min - VZ) / (IZ,min + IL,max)",
    spiceTemplate: `* Linear Zener Regulated Power Supply
Vdc vfiltro 0 DC {Vin_min}
RZ vfiltro vout {RZ}
DZ 0 vout DZENER
RL vout 0 {RL}
.model DZENER D(BV={VZ} IBV=5m RS=0.5)
.control
op
wrdata output.txt v(vout)
.endc
.end`,
    numericalExample: {
      specs: { v_z: 9, i_l_max: 0.05, v_sec_rms: 12, v_ripple: 1.5, f_line: 60, i_z_min: 0.005 },
      computed: { Vm: 15.57, C: 0.00033, Vin_min: 14.07, RZ: 92.18, RL: 180 },
      expected: { vout: 9 },
    },
  },
  {
    id: "double_ended_clipper",
    name: "Recortador de Voltaje Polarizado a Dos Niveles (Slicer)",
    category: "diodos",
    description:
      "Limita simétricamente o asimétricamente los picos positivos y negativos de una señal alterna cuando sobrepasan los niveles Vclip+ y Vclip-.",
    topologySummary:
      "Resistor serie R entre vin y vout. Rama positiva: D1 en serie con V1 a tierra. Rama negativa: D2 invertido en serie con V2 a tierra. Carga RL en paralelo.",
    parametersSchema: {
      v_m: {
        type: "number",
        unit: "V",
        description: "Amplitud pico de la señal de entrada",
        required: true,
      },
      v_clip_pos: {
        type: "number",
        unit: "V",
        description: "Nivel de recorte positivo deseado",
        required: true,
      },
      v_clip_neg: {
        type: "number",
        unit: "V",
        description: "Nivel de recorte negativo deseado (valor negativo)",
        required: true,
      },
      r_l: {
        type: "number",
        unit: "Ohm",
        description: "Resistencia de carga",
        default: 100000,
        required: false,
      },
    },
    operatingConstraints:
      "100 * Rd < R < 0.01 * RL para recorte nítido sin atenuar la señal dentro de los límites.",
    designEquations:
      "1. V1 = V_clip_pos - 0.7\n2. V2 = |V_clip_neg| - 0.7\n3. R = sqrt(100*Rd * 0.01*RL)\n4. Salida acotada en [V_clip_neg, V_clip_pos].",
    spiceTemplate: `* Double Ended Clipper (Slicer)
Vin vin 0 SIN(0 {Vm} 1000)
R1 vin vout {R}
D1 vout v1node DIODE_1N4148
V1 v1node 0 DC {V1}
D2 v2node vout DIODE_1N4148
V2 v2node 0 DC {V2}
RL vout 0 {RL}
.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)
.control
tran 1u 5m 3m
meas tran vpos MAX v(vout) from=3m to=5m
echo $&vpos > output.txt
.endc
.end`,
    numericalExample: {
      specs: { v_m: 15, v_clip_pos: 5.7, v_clip_neg: -3.7, r_l: 100000 },
      computed: { V1: 5.0, V2: 3.0, R: 1000 },
      expected: { vpos: 5.7 },
    },
  },
  {
    id: "bjt_common_emitter_amp",
    name: "Amplificador BJT Emisor Común con Desacople de Emisor",
    category: "polarizacion_bjt",
    description:
      "Amplificador de señal pequeña con BJT en configuración Emisor Común con polarización por divisor de tensión y condensador de desacople CE para alta ganancia en CA con desfase de 180 grados.",
    topologySummary:
      "Divisor RB1-RB2 en base con condensador Cin; colector con RC y condensador Cout hacia RL; emisor con RE en paralelo con condensador de desacople CE a tierra.",
    parametersSchema: {
      v_cc: {
        type: "number",
        unit: "V",
        description: "Voltaje de alimentación de continua",
        required: true,
      },
      i_cq: {
        type: "number",
        unit: "A",
        description: "Corriente de colector en el punto Q",
        required: true,
      },
      v_ceq: {
        type: "number",
        unit: "V",
        description: "Voltaje colector-emisor en reposo",
        required: true,
      },
      beta: {
        type: "number",
        description: "Ganancia de corriente del transistor",
        default: 100,
        required: false,
      },
      f_low: {
        type: "number",
        unit: "Hz",
        description: "Frecuencia inferior de corte de la banda pasante",
        default: 20,
        required: false,
      },
      r_l: {
        type: "number",
        unit: "Ohm",
        description: "Resistencia de carga",
        default: 10000,
        required: false,
      },
    },
    operatingConstraints:
      "R_TH <= 0.1 * beta * RE. X_CE <= 0.1 * re a la frecuencia f_low. Ganancia AvL = -(RC || RL) / re.",
    designEquations:
      "1. VE = 0.1 * VCC => RE = VE / ICQ\n2. RC = (VCC - VCEQ - VE) / ICQ\n3. re = 26mV / ICQ\n4. R_TH = 0.1*beta*RE, V_TH = 0.7 + VE\n5. RB1 = VCC*R_TH/V_TH, RB2 = VCC*R_TH/(VCC - V_TH)\n6. CE >= 1 / (2*pi*f_low*(re || RE))",
    spiceTemplate: `* BJT Common Emitter AC Amplifier with Emitter Bypass
VCC vcc 0 DC {VCC}
Vin vin 0 DC 0 AC 0.01 SIN(0 0.01 1000)
Cin vin vb 10u
RB1 vcc vb {RB1}
RB2 vb 0 {RB2}
RC vcc vc {RC}
RE ve 0 {RE}
CE ve 0 {CE}
Q1 vc vb ve NPN_MODEL
Cout vc vout 10u
RL vout 0 {RL}
.model NPN_MODEL NPN(BF={beta})
.control
op
let vceq = v(vc) - v(ve)
echo $&vceq > output.txt
.endc
.end`,
    numericalExample: {
      specs: { v_cc: 12, i_cq: 0.002, v_ceq: 6, beta: 100, r_l: 10000, f_low: 20 },
      computed: { RE: 600, RC: 2400, RB1: 37890, RB2: 7120, CE: 0.001, re: 13, Av: -148.8 },
      expected: { v_ceq: 6, i_cq: 0.002 },
    },
  },
  {
    id: "opamp_integrator_practical",
    name: "Amplificador Integrador Analógico Práctico (con Rf)",
    category: "opamp",
    description:
      "Genera una salida proporcional a la integral en el tiempo de la señal de entrada, con resistencia Rf en paralelo con Cf para evitar saturación por offsets de continua.",
    topologySummary:
      "Resistor Rin desde Vin a entrada inversora (-); entrada no inversora (+) a tierra; red paralelo Cf || Rf entre (-) y vout.",
    parametersSchema: {
      f_int: {
        type: "number",
        unit: "Hz",
        description: "Frecuencia mínima a partir de la cual integra con precisión",
        required: true,
      },
      a_dc: {
        type: "number",
        description: "Ganancia máxima permitida en continua (Adc = Rf / Rin)",
        default: 10,
        required: false,
      },
      c_f: {
        type: "number",
        unit: "F",
        description: "Condensador de realimentación",
        default: 1e-8,
        required: false,
      },
    },
    operatingConstraints:
      "Para integración precisa, f_señal >= 10 * f_c (donde f_c = 1 / (2*pi*Rf*Cf)).",
    designEquations:
      "1. Rin = 1 / (2 * pi * f_int * Cf)\n2. Rf = Adc * Rin\n3. fc = 1 / (2 * pi * Rf * Cf)\n4. vo(t) = -(1 / (Rin*Cf)) * integral(vin dt)",
    spiceTemplate: `* Practical Op-Amp Integrator
Vin vin 0 PULSE(-1 1 0 10n 10n 0.5m 1m)
Rin vin vminus {Rin}
Rf vminus vout {Rf}
Cf vminus vout {Cf}
X1 0 vminus vout opamp

.subckt opamp inp inn out
Rin inp inn 1e6
Egain n1 0 inp inn 1e5
Rp n1 n2 1k
Cp n2 0 159n
Eout out 0 n2 0 1
.ends

.control
tran 10u 4m 2m
meas tran vpeak MAX v(vout) from=2m to=4m
echo $&vpeak > output.txt
.endc
.end`,
    numericalExample: {
      specs: { f_int: 1000, a_dc: 10, c_f: 1e-8 },
      computed: { Rin: 15910, Rf: 159100, fc: 99.47 },
      expected: { fc: 100 },
    },
  },
  {
    id: "sallen_key_lowpass_butterworth",
    name: "Filtro Pasa-Bajos Activo Sallen-Key 2.º Orden (Butterworth)",
    category: "filtros",
    description:
      "Filtro activo de segundo orden con pendiente de atenuación de -40 dB/década y respuesta plana Butterworth (Q=0.707).",
    topologySummary:
      "Vin conectado a R1; nodo intermedio N1 con R2 hacia entrada (+); C1 entre N1 y vout; C2 entre entrada (+) y tierra; entrada (-) unida a vout (K=1).",
    parametersSchema: {
      f_o: {
        type: "number",
        unit: "Hz",
        description: "Frecuencia de corte deseada a -3 dB",
        required: true,
      },
      c1: {
        type: "number",
        unit: "F",
        description: "Condensador de realimentación C1",
        default: 1e-8,
        required: false,
      },
    },
    operatingConstraints:
      "Para respuesta Butterworth con R1 = R2 = R: C2 = C1 / 2. Ganancia K=1 estrictamente estable.",
    designEquations:
      "1. Seleccionar C1 comercial (ej. 10 nF).\n2. C2 = C1 / (4 * Q^2) = C1 / 2 (para Q = 0.707).\n3. R = 1 / (2 * pi * f_o * sqrt(C1 * C2)).\n4. H(s) = omega_o^2 / (s^2 + (omega_o/Q)*s + omega_o^2).",
    spiceTemplate: `* Sallen-Key 2nd Order Butterworth Lowpass Filter
Vin vin 0 DC 0 AC 1
R1 vin n1 {R}
R2 n1 vplus {R}
C1 n1 vout {C1}
C2 vplus 0 {C2}
X1 vplus vout vout opamp

.subckt opamp inp inn out
Rin inp inn 1e6
Egain n1 0 inp inn 1e5
Rp n1 n2 1k
Cp n2 0 159n
Eout out 0 n2 0 1
.ends

.control
ac dec 100 10 1e6
meas ac fo WHEN vdb(vout)=-3.0103
echo $&fo > output.txt
.endc
.end`,
    numericalExample: {
      specs: { f_o: 5000, c1: 1e-8 },
      computed: { C1: 1e-8, C2: 4.7e-9, R: 4643 },
      expected: { fo: 5000 },
    },
  },
];

export async function listCircuits(category?: string): Promise<CircuitKnowledge[]> {
  try {
    const query = db.select().from(circuitKnowledge);
    const rows = category ? await query.where(eq(circuitKnowledge.category, category)) : await query;
    if (rows.length > 0) {
      return rows;
    }
  } catch {
    // Fallback a inicial si la tabla no existe o la conexión falla
  }

  if (category) {
    return INITIAL_CIRCUITS_SEED.filter((c) => c.category === category).map((c) => ({
      ...c,
      numericalExample: c.numericalExample ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }
  return INITIAL_CIRCUITS_SEED.map((c) => ({
    ...c,
    numericalExample: c.numericalExample ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

export async function getCircuitById(id: string): Promise<CircuitKnowledge | null> {
  try {
    const [row] = await db
      .select()
      .from(circuitKnowledge)
      .where(eq(circuitKnowledge.id, id))
      .limit(1);
    if (row) return row;
  } catch {
    // Fallback a inicial
  }

  const fallback = INITIAL_CIRCUITS_SEED.find((c) => c.id === id);
  if (!fallback) return null;
  return {
    ...fallback,
    numericalExample: fallback.numericalExample ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function upsertCircuit(input: CreateCircuitKnowledgeInput): Promise<CircuitKnowledge> {
  const [row] = await db
    .insert(circuitKnowledge)
    .values({
      ...input,
      numericalExample: input.numericalExample ?? null,
    })
    .onConflictDoUpdate({
      target: circuitKnowledge.id,
      set: {
        name: input.name,
        category: input.category,
        description: input.description,
        topologySummary: input.topologySummary,
        parametersSchema: input.parametersSchema,
        operatingConstraints: input.operatingConstraints,
        designEquations: input.designEquations,
        spiceTemplate: input.spiceTemplate,
        numericalExample: input.numericalExample ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function seedCircuitKnowledge(): Promise<{ seeded: number }> {
  let count = 0;
  for (const circuit of INITIAL_CIRCUITS_SEED) {
    await upsertCircuit(circuit);
    count++;
  }
  return { seeded: count };
}
