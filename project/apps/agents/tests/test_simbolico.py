"""Motor simbólico: MNA en el dominio s con op-amps y fuentes controladas.

Los casos de referencia son problemas del Franco (Design with Op Amps, 4.ª
ed.) resueltos a mano; el enunciado no se copia, solo el circuito.
"""

import pytest
import sympy as sp

from agents.analisis.red import RedInvalida
from agents.analisis.simbolico import evaluar, leer_circuito, resolver, verificar_con_ngspice


def num(x) -> float:
    return float(sp.N(x))


# --- lectura ----------------------------------------------------------------------


def test_lee_fuentes_controladas_op_amps_y_valores_simbolicos():
    c = leer_circuito(
        """* titulo
        VS s 0 DC 0.150
        RS s i 100k
        RI i 0 {Ri}
        GM 0 o i 0 {Ag}
        E1 a 0 i 0 2
        F1 b 0 VS 3
        H1 c 0 VS 1k
        X1 p n o OPAMP
        X2 p n q OPAMP a=1e4 rd=2meg ro=75
        """
    )
    por_nombre = {k.nombre: k for k in c}
    assert por_nombre["RI"].valor == sp.Symbol("Ri")
    assert por_nombre["GM"].nodos == ("0", "o", "i", "0")
    assert por_nombre["F1"].control == "VS"
    assert por_nombre["X1"].params == {}
    assert num(por_nombre["X2"].params["a"]) == 1e4
    assert num(por_nombre["X2"].params["rd"]) == 2e6


def test_rechaza_lo_que_no_sabe_resolver():
    with pytest.raises(RedInvalida, match="Q1"):
        leer_circuito("Q1 c b e NPN\nR1 c 0 1k\n")
    with pytest.raises(RedInvalida, match="F1"):
        leer_circuito("V1 a 0 1\nF1 b 0 VX 2\nR1 b 0 1k\n")  # VX no existe


# --- op-amps (Franco cap. 1) --------------------------------------------------------


def test_p1_6_ganancia_de_lazo_abierto():
    c = leer_circuito("VP p 0 0.75025\nVN n 0 0.75150\nX1 p n o OPAMP a=1e4\n")
    s = resolver(c)
    assert num(evaluar(s, "V(o)")) == pytest.approx(-12.5)


def test_p1_11_inversor_con_ganancia_finita():
    c = leer_circuito("VI i 0 0.1\nR1 i n 10k\nR2 n o 100k\nX1 0 n o OPAMP a=100\n")
    s = resolver(c)
    vo = num(evaluar(s, "V(o)"))
    assert vo == pytest.approx(-1 / (1 + 11 / 100), rel=1e-9)
    assert num(evaluar(s, "V(n)")) == pytest.approx(-vo / 100, rel=1e-9)


def test_p1_15_op_amp_ideal_con_fuente_flotante():
    c = leer_circuito(
        "R1 n 0 10k\nV4 o n 4\nX1 p n o OPAMP\nR3 p 0 30k\nR2 p o 20k\n"
    )
    s = resolver(c)
    assert num(evaluar(s, "V(o)")) == pytest.approx(10)
    assert num(evaluar(s, "V(n)")) == pytest.approx(6)
    assert num(evaluar(s, "V(p)")) == pytest.approx(6)
    # la fuente de 4 V entrega 0.6 mA de o hacia n (por dentro, de - a +)
    assert num(evaluar(s, "I(R1)")) == pytest.approx(0.6e-3)


def test_p1_16_fuente_de_corriente_flotante():
    c = leer_circuito(
        "I1 b a 1m\nR3 a n 3k\nR4 n o 4k\nR2 b p 2k\nR1 p 0 1k\nX1 p n o OPAMP\n"
    )
    s = resolver(c)
    assert num(evaluar(s, "V(p)")) == pytest.approx(-1)
    assert num(evaluar(s, "V(n)")) == pytest.approx(-1)
    assert num(evaluar(s, "V(o)")) == pytest.approx(-5)


# --- fuentes controladas -------------------------------------------------------------


def test_fuentes_controladas_e_g_f_h():
    c = leer_circuito(
        """V1 i 0 2
        R0 i 0 1k
        E1 a 0 i 0 3
        RA a 0 1k
        G1 0 b i 0 1m
        RB b 0 1k
        F1 0 c V1 2
        RC c 0 1k
        H1 d 0 V1 500
        RD d 0 1k
        """
    )
    s = resolver(c)
    assert num(evaluar(s, "V(a)")) == pytest.approx(6)  # 3·V(i)
    assert num(evaluar(s, "V(b)")) == pytest.approx(2)  # 1 mA/V · 2 V · 1 kΩ hacia b
    # I(V1): la corriente que entra por el borne + de V1 es -2 mA (V1 entrega 2 mA a R0)
    assert num(evaluar(s, "I(V1)")) == pytest.approx(-2e-3)
    # F: 2·I(V1) circula de n+ (0) a n- (c) por dentro de la fuente: entra a c
    assert num(evaluar(s, "V(c)")) == pytest.approx(2 * -2e-3 * 1e3)
    assert num(evaluar(s, "V(d)")) == pytest.approx(500 * -2e-3)


def test_simbolico_cuando_falta_un_valor():
    c = leer_circuito("VI i 0 {vi}\nR1 i n {R1}\nR2 n o {R2}\nX1 0 n o OPAMP\n")
    s = resolver(c)
    vi, r1, r2 = sp.symbols("vi R1 R2")
    assert sp.simplify(evaluar(s, "V(o)") - (-r2 / r1 * vi)) == 0


def test_el_dominio_s_da_la_funcion_de_transferencia():
    # RC pasa bajos: H(s) = 1 / (1 + sRC)
    c = leer_circuito("VI i 0 AC 1\nR1 i o 1k\nC1 o 0 1u\n")
    s = resolver(c, dominio="s")
    h = sp.simplify(evaluar(s, "V(o)") / evaluar(s, "V(i)"))
    sv = sp.Symbol("s")
    assert sp.simplify(h - 1 / (1 + sv * sp.Rational(1, 1000))) == 0


def test_un_lazo_de_fuentes_de_tension_es_un_error_claro():
    with pytest.raises(RedInvalida, match="singular"):
        resolver(leer_circuito("V1 a 0 1\nV2 a 0 2\n"))


# --- verificación con ngspice ----------------------------------------------------------


def test_ngspice_confirma_un_circuito_con_op_amp_ideal():
    c = leer_circuito(
        "I1 b a 1m\nR3 a n 3k\nR4 n o 4k\nR2 b p 2k\nR1 p 0 1k\nX1 p n o OPAMP\n"
    )
    v = verificar_con_ngspice(c, resolver(c))
    assert v["error"] is None
    assert v["coincide"] is True
    assert v["tensiones"]["o"] == pytest.approx(-5, rel=1e-6)


def test_ngspice_confirma_fuentes_controladas_y_op_amp_finito():
    c = leer_circuito(
        "VI i 0 0.1\nR1 i n 10k\nR2 n o 100k\nX1 0 n o OPAMP a=100 rd=1meg ro=100\n"
        "G1 0 b i 0 1m\nRB b 0 1k\n"
    )
    v = verificar_con_ngspice(c, resolver(c))
    assert v["error"] is None
    assert v["coincide"] is True


def test_ngspice_no_verifica_lo_simbolico():
    c = leer_circuito("VI i 0 {vi}\nR1 i o 1k\nR2 o 0 1k\n")
    v = verificar_con_ngspice(c, resolver(c))
    assert v["coincide"] is False
    assert "simbólic" in v["error"]
