import os
import time
from typing import Any

import httpx
from pydantic import BaseModel


class CircuitKnowledgeItem(BaseModel):
    id: str
    name: str
    category: str
    description: str
    topologySummary: str
    parametersSchema: dict[str, Any]
    operatingConstraints: str | None = None
    designEquations: str | None = None
    spiceTemplate: str | None = None
    numericalExample: dict[str, Any] | None = None


# Catálogo fallback local con las 6 topologías base si el server no está disponible
FALLBACK_CIRCUITS: list[CircuitKnowledgeItem] = [
    CircuitKnowledgeItem(
        id="rc_lowpass_passive",
        name="Filtro Pasa-Bajos Pasivo RC de 1.er Orden",
        category="filtros",
        description="Atenúa componentes de alta frecuencia por encima de la frecuencia de corte (f_c) a -20 dB/década.",
        topologySummary="Fuente Vin conectada a R; C conectado entre salida (vout) y tierra (0).",
        parametersSchema={
            "f_c": {"type": "number", "unit": "Hz", "description": "Frecuencia de corte (-3 dB)"},
            "c": {"type": "number", "unit": "F", "description": "Condensador", "default": 1e-8},
        },
        operatingConstraints="RL >= 10*R.",
        designEquations="R = 1 / (2 * pi * f_c * C).",
        spiceTemplate="* RC Lowpass Filter\nVin vin 0 DC 0 AC 1\nR1 vin vout {R}\nC1 vout 0 {C}\n.control\nac dec 100 1 1e9\nmeas ac fc WHEN vdb(vout)=-3.0103\necho $&fc > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="bjt_voltage_divider",
        name="Polarización por Divisor de Voltaje en BJT (Emisor Común)",
        category="polarizacion_bjt",
        description="Polarización estable en CC para BJT NPN fijando punto Q (ICQ, VCEQ).",
        topologySummary="Divisor RB1-RB2 en base, RC en colector, RE en emisor a tierra. Transistor NPN.",
        parametersSchema={
            "v_cc": {"type": "number", "unit": "V", "description": "Alimentación VCC"},
            "i_cq": {"type": "number", "unit": "A", "description": "Corriente de colector Q"},
            "v_ceq": {"type": "number", "unit": "V", "description": "Voltaje colector-emisor Q"},
            "beta": {"type": "number", "description": "Beta transistor", "default": 100},
        },
        operatingConstraints="V_BE ~= 0.7V, V_CEQ > 0.2V, R_TH <= 0.1 * beta * RE.",
        designEquations="RE = (VCC - VCEQ)/(4*ICQ), RC = 3*RE, R_TH = 0.1*beta*RE, V_TH = VBE + ICQ*RE*(1+0.1/beta).",
        spiceTemplate="* BJT Common Emitter Voltage Divider Bias\nVCC vcc 0 DC {VCC}\nRB1 vcc vb {RB1}\nRB2 vb 0 {RB2}\nRC vcc vc {RC}\nRE ve 0 {RE}\nQ1 vc vb ve NPN_MODEL\n.model NPN_MODEL NPN(BF={beta})\n.control\nop\nlet vceq = v(vc) - v(ve)\nlet icq = -i(VCC) - (v(vcc) - v(vb))/{RB1}\necho $&vceq > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="diode_clamper",
        name="Circuito Sujetador de Voltaje con Diodo (Clamper)",
        category="diodos",
        description="Desplaza verticalmente el nivel continuo de una señal sin alterar amplitud ni forma de onda.",
        topologySummary="Condensador serie C entre vin y vout; diodo D en paralelo a tierra; carga RL.",
        parametersSchema={
            "v_m": {"type": "number", "unit": "V", "description": "Voltaje pico entrada"},
            "freq": {"type": "number", "unit": "Hz", "description": "Frecuencia de señal"},
        },
        operatingConstraints="tau = RL * C >= 10 / freq.",
        designEquations="VC = Vm - 0.7V. RL >= 10 / (freq * C).",
        spiceTemplate="* Diode Clamper Circuit\nVin vin 0 SIN(0 {Vm} {freq})\nC1 vin vout {C}\nD1 0 vout DIODE_1N4148\nRL vout 0 {RL}\n.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)\n.control\ntran {tstep} {tstop} {tstart}\nmeas tran vomax MAX v(vout) from={tstart} to={tstop}\necho $&vomax > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="diode_clipper",
        name="Circuito Recortador de Voltaje con Diodo (Clipper)",
        category="diodos",
        description="Recorta o limita la amplitud máxima de la señal por encima de un voltaje preestablecido.",
        topologySummary="Resistencia serie R entre vin y vout; diodo D en serie con Vbias a tierra.",
        parametersSchema={
            "v_m": {"type": "number", "unit": "V", "description": "Voltaje pico entrada"},
            "v_recorte": {"type": "number", "unit": "V", "description": "Voltaje de recorte"},
            "freq": {"type": "number", "unit": "Hz", "description": "Frecuencia de señal", "default": 1000},
        },
        operatingConstraints="100*Rd < R < 0.01*RL.",
        designEquations="Vbias = V_recorte - 0.7V.",
        spiceTemplate="* Diode Clipper Circuit\nVin vin 0 SIN(0 {Vm} {freq})\nR1 vin vout {R}\nD1 vout vbias DIODE_1N4148\nVbias vbias 0 DC {Vbias}\nRL vout 0 {RL}\n.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)\n.control\ntran {tstep} {tstop} {tstart}\nmeas tran vclip MAX v(vout) from={tstart} to={tstop}\necho $&vclip > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="opamp_highpass_active",
        name="Filtro Pasa-Altos Activo RC de 1.er Orden (Op-Amp)",
        category="opamp",
        description="Atenúa frecuencias por debajo de f_c a +20 dB/década y entrega ganancia A >= 1.",
        topologySummary="Red RC pasa-altos en entrada (+) de Op-Amp; resistencias Rg y Rf en realimentación negativa.",
        parametersSchema={
            "f_c": {"type": "number", "unit": "Hz", "description": "Frecuencia de corte"},
            "gain": {"type": "number", "description": "Ganancia A >= 1", "default": 2},
        },
        operatingConstraints="A = 1 + Rf / Rg >= 1.",
        designEquations="R = 1 / (2 * pi * f_c * C). Rf = (gain - 1) * Rg.",
        spiceTemplate="* Active Highpass RC Filter\nVin vin 0 DC 0 AC 1\nC1 vin vplus {C}\nR1 vplus 0 {R}\nX1 vplus vfb vout opamp\nRg vfb 0 {R1}\nRf vout vfb {Rf}\n\n.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n\n.control\nac dec 100 1 1e9\nmeas ac gpass FIND vdb(vout) AT=1e6\nlet g_3db = gpass - 3.0103\nmeas ac fc WHEN vdb(vout)=g_3db\necho $&fc > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="opamp_noninverting_amp",
        name="Amplificador No Inversor con Op-Amp",
        category="opamp",
        description="Amplifica una señal continua o alterna sin inversión de fase con ganancia A = 1 + Rf / Rg.",
        topologySummary="Entrada Vin a terminal no inversor (+); divisor de realimentación Rf-Rg entre vout, terminal inversor (-) y tierra.",
        parametersSchema={
            "v_in": {"type": "number", "unit": "V", "description": "Voltaje de entrada"},
            "v_out": {"type": "number", "unit": "V", "description": "Voltaje deseado de salida"},
        },
        operatingConstraints="v_out >= v_in (ganancia no inversora A >= 1).",
        designEquations="Rg = 1000. Rf = (v_out / v_in - 1) * Rg.",
        spiceTemplate="* Noninverting Op-Amp Amplifier\nVin vin 0 DC {v_in}\nR1 vout vfb {Rf}\nR2 vfb 0 {Rg}\nX1 vin vfb vout opamp\n.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="voltage_divider",
        name="Divisor de Tensión Resistivo",
        category="divisores",
        description="Escala una tensión de entrada a un valor proporcional inferior.",
        topologySummary="R1 conectado a vin y vout; R2 entre vout y tierra.",
        parametersSchema={
            "v_in": {"type": "number", "unit": "V", "description": "Voltaje entrada"},
            "v_out": {"type": "number", "unit": "V", "description": "Voltaje deseado"},
        },
        operatingConstraints="V_out < V_in.",
        designEquations="R2 = R1 * V_out / (V_in - V_out).",
        spiceTemplate="* Resistive Voltage Divider\nVin vin 0 DC {Vin}\nR1 vin vout {R1}\nR2 vout 0 {R2}\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="zener_regulated_power_supply",
        name="Fuente de Alimentación Regulada Lineal con Zener",
        category="fuentes_reguladas",
        description="Transforma CA de red en continua constante regulada con rectificador, condensador y diodo Zener.",
        topologySummary="Transformador a puente D1-D4; filtro C en paralelo; resistencia RZ en serie; diodo Zener DZ en paralelo con RL a tierra.",
        parametersSchema={
            "v_z": {"type": "number", "unit": "V", "description": "Tensión regulada VZ"},
            "i_l_max": {"type": "number", "unit": "A", "description": "Corriente de carga máxima"},
            "v_sec_rms": {"type": "number", "unit": "V", "description": "Tensión eficaz del secundario"},
            "v_ripple": {"type": "number", "unit": "V", "description": "Rizado máximo", "default": 1.5},
        },
        operatingConstraints="Vin,min = Vm - Vripple > VZ. PZ = VZ * (IZ,min + IL,max) <= PZ,nominal.",
        designEquations="Vm = sqrt(2)*V_sec_rms - 1.4. C >= IL,max / (2 * f_line * V_ripple). RZ = (Vin,min - VZ)/(IZ,min + IL,max).",
        spiceTemplate="* Linear Zener Regulated Power Supply\nVdc vfiltro 0 DC {Vin_min}\nRZ vfiltro vout {RZ}\nDZ 0 vout DZENER\nRL vout 0 {RL}\n.model DZENER D(BV={VZ} IBV=5m RS=0.5)\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="double_ended_clipper",
        name="Recortador de Voltaje Polarizado a Dos Niveles (Slicer)",
        category="diodos",
        description="Limita simétricamente o asimétricamente los picos positivos y negativos de una señal de CA.",
        topologySummary="Resistor serie R entre vin y vout; rama D1+V1 y rama D2+V2 a tierra; carga RL en paralelo.",
        parametersSchema={
            "v_m": {"type": "number", "unit": "V", "description": "Amplitud pico entrada"},
            "v_clip_pos": {"type": "number", "unit": "V", "description": "Nivel recorte positivo"},
            "v_clip_neg": {"type": "number", "unit": "V", "description": "Nivel recorte negativo (con signo)"},
            "freq": {"type": "number", "unit": "Hz", "description": "Frecuencia de señal", "default": 1000},
        },
        operatingConstraints="100*Rd < R < 0.01*RL.",
        designEquations="V1 = V_clip_pos - 0.7. V2 = V_clip_neg + 0.7 (con signo: -3.7 V -> V2 = -3.0 V). R = sqrt(100*Rd * 0.01*RL).",
        spiceTemplate="* Double Ended Clipper (Slicer)\nVin vin 0 SIN(0 {Vm} {freq})\nR1 vin vout {R}\nD1 vout v1node DIODE_1N4148\nV1 v1node 0 DC {V1}\nD2 v2node vout DIODE_1N4148\nV2 v2node 0 DC {V2}\nRL vout 0 {RL}\n.model DIODE_1N4148 D(IS=2.52n RS=0.568 N=1.752)\n.control\ntran {tstep} {tstop} {tstart}\nmeas tran vpos MAX v(vout) from={tstart} to={tstop}\necho $&vpos > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="bjt_common_emitter_amp",
        name="Amplificador BJT Emisor Común con Desacople de Emisor",
        category="polarizacion_bjt",
        description="Amplificador de pequeña señal con BJT en emisor común y condensador CE para alta ganancia en CA.",
        topologySummary="Divisor RB1-RB2 en base con Cin; colector con RC y Cout a RL; emisor con RE en paralelo con CE a tierra.",
        parametersSchema={
            "v_cc": {"type": "number", "unit": "V", "description": "Alimentación VCC"},
            "i_cq": {"type": "number", "unit": "A", "description": "Corriente colector reposo"},
            "v_ceq": {"type": "number", "unit": "V", "description": "Voltaje colector-emisor reposo"},
        },
        operatingConstraints="R_TH <= 0.1*beta*RE. Ganancia AvL = -(RC || RL) / re.",
        designEquations="RE = 0.1*VCC/ICQ, RC = (VCC - VCEQ - VE)/ICQ, re = 26mV/ICQ, CE >= 1/(2*pi*f_low*(re || RE)).",
        spiceTemplate="* BJT Common Emitter AC Amplifier with Emitter Bypass\nVCC vcc 0 DC {VCC}\nVin vin 0 DC 0 AC 0.01 SIN(0 0.01 1000)\nCin vin vb 10u\nRB1 vcc vb {RB1}\nRB2 vb 0 {RB2}\nRC vcc vc {RC}\nRE ve 0 {RE}\nCE ve 0 {CE}\nQ1 vc vb ve NPN_MODEL\nCout vc vout 10u\nRL vout 0 {RL}\n.model NPN_MODEL NPN(BF={beta})\n.control\nop\nlet vceq = v(vc) - v(ve)\necho $&vceq > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="opamp_integrator_practical",
        name="Amplificador Integrador Analógico Práctico (con Rf)",
        category="opamp",
        description="Integra en el tiempo la tensión de entrada con resistencia Rf para evitar saturación por offsets.",
        topologySummary="Resistor Rin de Vin a entrada (-); entrada (+) a tierra; red paralelo Cf || Rf entre (-) y vout.",
        parametersSchema={
            "f_int": {"type": "number", "unit": "Hz", "description": "Frecuencia crítica integración"},
            "a_dc": {"type": "number", "description": "Ganancia continua Adc", "default": 10},
        },
        operatingConstraints="f_señal >= 10 * fc donde fc = 1 / (2*pi*Rf*Cf).",
        designEquations="Rin = 1 / (2*pi*f_int*Cf), Rf = Adc * Rin, fc = 1 / (2*pi*Rf*Cf).",
        spiceTemplate="* Practical Op-Amp Integrator\nVin vin 0 PULSE(-1 1 0 10n 10n 0.5m 1m)\nRin vin vminus {Rin}\nRf vminus vout {Rf}\nCf vminus vout {Cf}\nX1 0 vminus vout opamp\n\n.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n\n.control\ntran 10u 4m 2m\nmeas tran vpeak MAX v(vout) from=2m to=4m\necho $&vpeak > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="sallen_key_lowpass_butterworth",
        name="Filtro Pasa-Bajos Activo Sallen-Key 2.º Orden (Butterworth)",
        category="filtros",
        description="Filtro activo de 2.º orden con atenuación de -40 dB/década y respuesta plana Butterworth.",
        topologySummary="Vin a R1; nodo N1 a R2 hacia entrada (+); C1 entre N1 y vout; C2 entre (+) y tierra; entrada (-) a vout.",
        parametersSchema={
            "f_o": {"type": "number", "unit": "Hz", "description": "Frecuencia de corte -3 dB"},
            "c1": {"type": "number", "unit": "F", "description": "Condensador C1", "default": 1e-8},
        },
        operatingConstraints="C2 = C1 / 2 para respuesta Butterworth. Ganancia K=1.",
        designEquations="C2 = C1 / 2. R = 1 / (2 * pi * f_o * sqrt(C1 * C2)).",
        spiceTemplate="* Sallen-Key 2nd Order Butterworth Lowpass Filter\nVin vin 0 DC 0 AC 1\nR1 vin n1 {R}\nR2 n1 vplus {R}\nC1 n1 vout {C1}\nC2 vplus 0 {C2}\nX1 vplus vout vout opamp\n\n.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n\n.control\nac dec 100 10 1e6\nmeas ac fo WHEN vdb(vout)=-3.0103\necho $&fo > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="opamp_inverting_amp",
        name="Amplificador Inversor con Op-Amp",
        category="opamp",
        description="Amplifica una señal invirtiendo su fase con ganancia A = -Rf / Rin.",
        topologySummary="Vin a Rin hacia la entrada inversora (-); Rf entre (-) y vout; entrada no inversora (+) a tierra.",
        parametersSchema={
            "v_in": {"type": "number", "unit": "V", "description": "Voltaje de entrada"},
            "v_out": {"type": "number", "unit": "V", "description": "Voltaje deseado de salida (signo opuesto a v_in)"},
            "rin": {"type": "number", "unit": "Ohm", "description": "Resistencia de entrada Rin (fija la impedancia de entrada)", "default": 10000},
        },
        operatingConstraints="La impedancia de entrada es Rin. |v_out| por debajo de la alimentación del op-amp.",
        designEquations="A = v_out / v_in (negativa). Rf = |A| * Rin.",
        spiceTemplate="* Inverting Op-Amp Amplifier\nVin vin 0 DC {v_in}\nRin vin vminus {Rin}\nRf vminus vout {Rf}\nX1 0 vminus vout opamp\n\n.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="opamp_difference_amp",
        name="Amplificador Diferencial (Restador) con Op-Amp",
        category="opamp",
        description="Amplifica la diferencia entre dos entradas, Vout = (Rf/Rg)·(Vp - Vn), y rechaza el modo común si las dos parejas de resistencias están apareadas.",
        topologySummary="Vn a Rg hacia (-) con Rf de (-) a vout; Vp a Rg hacia (+) con Rf de (+) a tierra. Dos parejas idénticas Rg/Rf.",
        parametersSchema={
            "gain": {"type": "number", "description": "Ganancia diferencial deseada Rf/Rg"},
            "v_d": {"type": "number", "unit": "V", "description": "Tensión diferencial de prueba Vp - Vn", "default": 0.1},
            "v_cm": {"type": "number", "unit": "V", "description": "Tensión de modo común de prueba", "default": 1.0},
            "rg": {"type": "number", "unit": "Ohm", "description": "Resistencia de entrada Rg", "default": 10000},
        },
        operatingConstraints="Las dos parejas Rg y Rf deben ser iguales (tolerancia 1 % o mejor) para un buen CMRR. Impedancia de entrada baja (Rg): si la fuente no es de baja impedancia, usar el amplificador de instrumentación.",
        designEquations="Rf = gain * Rg. Vout = (Rf/Rg)(Vp - Vn).",
        spiceTemplate="* Difference Op-Amp Amplifier\nVp vp 0 DC {Vp}\nVn vn 0 DC {Vn}\nR1 vn vminus {Rg}\nR2 vminus vout {Rf}\nR3 vp vplus {Rg}\nR4 vplus 0 {Rf}\nX1 vplus vminus vout opamp\n\n.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n.control\nop\nlet gain = v(vout) / (v(vp) - v(vn))\necho $&gain > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="opamp_instrumentation_amp",
        name="Amplificador de Instrumentación de Tres Op-Amps",
        category="opamp",
        description="Amplificador diferencial de alta impedancia de entrada y alto CMRR; la ganancia se fija con una sola resistencia RG: G = 1 + 2R/RG.",
        topologySummary="Etapa de entrada: dos seguidores no inversores (A1 en Vp, A2 en Vn) unidos por R-RG-R entre sus entradas inversoras. Etapa de salida: restador de ganancia unitaria con cuatro resistencias Rd.",
        parametersSchema={
            "gain": {"type": "number", "description": "Ganancia diferencial total deseada (>= 1)"},
            "v_d": {"type": "number", "unit": "V", "description": "Tensión diferencial de prueba Vp - Vn", "default": 0.01},
            "v_cm": {"type": "number", "unit": "V", "description": "Tensión de modo común de prueba", "default": 1.0},
            "r": {"type": "number", "unit": "Ohm", "description": "Resistencias R de la etapa de entrada", "default": 10000},
        },
        operatingConstraints="G >= 1. Las cuatro Rd del restador deben estar apareadas. Las salidas de A1/A2 no deben saturar: |v_cm| + G·|v_d|/2 por debajo de la alimentación.",
        designEquations="G = 1 + 2R/RG  =>  RG = 2R / (G - 1). Restador con Rd iguales (ganancia 1). Para G = 1, RG abierta (se usa un valor muy grande).",
        spiceTemplate="* Three Op-Amp Instrumentation Amplifier\nVp vp 0 DC {Vp}\nVn vn 0 DC {Vn}\nX1 vp n1 a1 opamp\nX2 vn n2 a2 opamp\nR1 a1 n1 {R}\nRG n1 n2 {RG}\nR2 a2 n2 {R}\nR3 a2 vminus {Rd}\nR4 vminus vout {Rd}\nR5 a1 vplus {Rd}\nR6 vplus 0 {Rd}\nX3 vplus vminus vout opamp\n\n.subckt opamp inp inn out\nRin inp inn 1e6\nEgain n1 0 inp inn 1e5\nRp n1 n2 1k\nCp n2 0 159n\nEout out 0 n2 0 1\n.ends\n.control\nop\nlet gain = v(vout) / (v(vp) - v(vn))\necho $&gain > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="rlc_series_bandpass",
        name="Circuito Resonante RLC Serie (Pasa-Banda)",
        category="resonancia",
        description="Circuito RLC serie con salida en R: en la frecuencia de resonancia f0 las reactancias de L y C se cancelan, la impedancia es mínima (R) y la salida es máxima.",
        topologySummary="Vin en serie con L y C; R entre vout y tierra (la salida se toma en R).",
        parametersSchema={
            "f_0": {"type": "number", "unit": "Hz", "description": "Frecuencia de resonancia"},
            "q": {"type": "number", "description": "Factor de calidad Q = f0 / BW", "default": 5},
            "c": {"type": "number", "unit": "F", "description": "Condensador", "default": 1e-8},
        },
        operatingConstraints="Q alto exige R pequeña frente a sqrt(L/C). Inductores reales tienen resistencia serie (ESR) que limita Q.",
        designEquations="f0 = 1 / (2*pi*sqrt(L*C)) => L = 1 / ((2*pi*f0)^2 * C). Q = (1/R)*sqrt(L/C) => R = sqrt(L/C) / Q. BW = f0 / Q. En resonancia X_L = X_C = 2*pi*f0*L.",
        spiceTemplate="* Series RLC Resonant Bandpass\nVin vin 0 DC 0 AC 1\nL1 vin n1 {L}\nC1 n1 vout {C}\nR1 vout 0 {R}\n.control\nac dec 1000 {f_start} {f_stop}\nmeas ac f0 WHEN vp(vout)=0\necho $&f0 > output.txt\n.endc\n.end",
    ),
    CircuitKnowledgeItem(
        id="rlc_parallel_tank",
        name="Circuito Resonante RLC Paralelo (Tanque)",
        category="resonancia",
        description="Tanque L||C alimentado a través de una resistencia: en f0 la impedancia del tanque es máxima y la tensión de salida es máxima.",
        topologySummary="Vin a Rs hacia vout; L y C en paralelo entre vout y tierra.",
        parametersSchema={
            "f_0": {"type": "number", "unit": "Hz", "description": "Frecuencia de resonancia"},
            "q": {"type": "number", "description": "Factor de calidad Q = f0 / BW", "default": 5},
            "c": {"type": "number", "unit": "F", "description": "Condensador", "default": 1e-8},
        },
        operatingConstraints="El Q cargado depende de Rs (y de la carga en paralelo): Q = Rs * sqrt(C/L).",
        designEquations="f0 = 1 / (2*pi*sqrt(L*C)) => L = 1 / ((2*pi*f0)^2 * C). Q = Rs*sqrt(C/L) => Rs = Q*sqrt(L/C). BW = f0 / Q.",
        spiceTemplate="* Parallel RLC Tank\nVin vin 0 DC 0 AC 1\nRs vin vout {Rs}\nL1 vout 0 {L}\nC1 vout 0 {C}\n.control\nac dec 1000 {f_start} {f_stop}\nmeas ac f0 WHEN vp(vout)=0\necho $&f0 > output.txt\n.endc\n.end",
    ),
]

_CIRCUITS_CACHE: tuple[float, list[CircuitKnowledgeItem]] | None = None
_CACHE_TTL_SECONDS = 60.0


def fetch_circuit_catalog(
    base_url: str | None = None,
    token: str | None = None,
    transport: httpx.BaseTransport | None = None,
) -> list[CircuitKnowledgeItem]:
    """Obtiene el catálogo de circuitos desde el servidor (Neon Postgres) con cache en memoria."""
    global _CIRCUITS_CACHE
    now = time.monotonic()
    is_default_call = base_url is None and transport is None
    if is_default_call and _CIRCUITS_CACHE is not None and now - _CIRCUITS_CACHE[0] < _CACHE_TTL_SECONDS:
        return _CIRCUITS_CACHE[1]

    base_url = base_url or os.environ.get("SERVER_BASE_URL")
    token = token or os.environ.get("AGENTS_SERVICE_TOKEN")

    if not base_url or not token:
        # Fallback local silencioso
        return FALLBACK_CIRCUITS

    client_kwargs = {"transport": transport} if transport is not None else {}
    try:
        with httpx.Client(**client_kwargs, timeout=5.0) as client:
            response = client.get(
                f"{base_url}/api/internal/circuits",
                headers={"Authorization": f"Bearer {token}"},
            )
            if response.status_code == 200:
                raw_items = response.json()
                items = [CircuitKnowledgeItem.model_validate(item) for item in raw_items]
                # Una topología nueva vive primero aquí, junto a su solver; hasta
                # que alguien vuelva a sembrar la base, el servidor no la conoce.
                # Sin esta unión el orquestador no podría elegirla aunque el
                # cálculo y la síntesis ya sepan resolverla.
                conocidos = {item.id for item in items}
                items += [c for c in FALLBACK_CIRCUITS if c.id not in conocidos]
                if is_default_call:
                    _CIRCUITS_CACHE = (now, items)
                return items
    except Exception:
        # En caso de error de conexión, usamos fallback local
        pass

    return FALLBACK_CIRCUITS


def fetch_circuit_detail(
    circuit_id: str,
    base_url: str | None = None,
    token: str | None = None,
    transport: httpx.BaseTransport | None = None,
) -> CircuitKnowledgeItem | None:
    """Obtiene el detalle completo de un circuito específico desde Neon o fallback."""
    catalog = fetch_circuit_catalog(base_url=base_url, token=token, transport=transport)
    for c in catalog:
        if c.id == circuit_id:
            return c
    for c in FALLBACK_CIRCUITS:
        if c.id == circuit_id:
            return c
    return None


def build_circuits_knowledge_context(circuits: list[CircuitKnowledgeItem] | None = None) -> str:
    """Genera la sección de conocimiento estructurado para inyectar en el prompt del LLM."""
    circuits = circuits or fetch_circuit_catalog()
    lines = [
        "## BASE DE CONOCIMIENTO DE CIRCUITOS DISPONIBLES (NEON POSTGRES)",
        "Cuando el usuario pida diseñar alguna de estas topologías:",
        "1. Solicita los parámetros requeridos si faltan (mode='clarify').",
        "2. Si están completos, genera un bloque de tipo 'catalog' con `circuit_id` igual al ID de la topología,",
        "   `params` con los parámetros extraídos, `metric` (ej: vout, fc) y `target` con el valor numérico deseado.",
        "3. NO escribas código SPICE ni calcules ecuaciones a mano; el subsistema de cálculo y síntesis lo hará automáticamente.",
        "4. Si el circuito no corresponde a ninguna topología del catálogo, solo entonces genera un bloque 'generic' (que debe incluir .control y escribir a output.txt).\n",
    ]

    for c in circuits:
        lines.append(f"### Topología: `{c.id}` - {c.name}")
        lines.append(f"- **Categoría:** {c.category}")
        lines.append(f"- **Descripción:** {c.description}")
        lines.append(f"- **Conexión:** {c.topologySummary}")
        lines.append("- **Parámetros:**")
        for name, spec in c.parametersSchema.items():
            required = spec.get("required", "default" not in spec)
            status = "requerido" if required else f"opcional, default={spec.get('default', 'no especificado')}"
            unit = f", {spec['unit']}" if spec.get("unit") else ""
            lines.append(
                f"  - `{name}` ({spec['type']}{unit}): {spec.get('description', '')} ({status})"
            )
        if c.operatingConstraints:
            lines.append(f"- **Restricciones:** {c.operatingConstraints}")
        if c.designEquations:
            lines.append(f"- **Ecuaciones de diseño:** {c.designEquations}")
        if c.spiceTemplate:
            lines.append("- **Plantilla SPICE de referencia:**")
            lines.append("```spice")
            lines.append(c.spiceTemplate)
            lines.append("```")
            lines.append(
                "> Nota: la plantilla anterior es solo referencia de topología. "
                "En el netlist final, todo `{...}` debe reemplazarse por el valor numérico "
                "ya calculado (o definirse con `.param` si de verdad es una expresión), "
                "nunca dejarse literal."
            )
        lines.append("")

    return "\n".join(lines)
