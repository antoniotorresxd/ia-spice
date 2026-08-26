import pytest

import agents.curador.node as curador_module
from agents.curador.reparacion import NetlistReparado, ReparacionError, repair_netlist

NETLIST_OK = (
    "* divisor\nVinput vin 0 10.0\nR1 vin vout 1000\nR2 vout 0 2000\n"
    ".control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n"
)


class _ModeloFalso:
    """Imita lo justo de un chat model: with_structured_output(...).invoke(...)."""

    def __init__(self, resultado):
        self._resultado = resultado

    def with_structured_output(self, schema):
        return self

    def invoke(self, mensajes):
        if isinstance(self._resultado, Exception):
            raise self._resultado
        self.mensajes = mensajes
        return self._resultado


def test_repair_netlist_devuelve_el_netlist_corregido():
    modelo = _ModeloFalso(NetlistReparado(netlist=NETLIST_OK))

    resultado = repair_netlist(
        modelo,
        description="un divisor",
        metric="v_out",
        target=5.0,
        netlist="* viejo\n.control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n",
        measured=6.67,
        sim_error=None,
    )

    assert resultado == NETLIST_OK


def test_el_prompt_lleva_la_meta_y_lo_que_se_midio():
    """El modelo no puede corregir a ciegas: necesita saber a qué apuntaba y
    qué salió de la simulación."""
    modelo = _ModeloFalso(NetlistReparado(netlist=NETLIST_OK))

    repair_netlist(
        modelo,
        description="un divisor resistivo",
        metric="v_out",
        target=5.0,
        netlist=NETLIST_OK,
        measured=6.67,
        sim_error=None,
    )

    texto = " ".join(m["content"] for m in modelo.mensajes)
    assert "un divisor resistivo" in texto
    assert "v_out" in texto
    assert "5.0" in texto
    assert "6.67" in texto


def test_cuando_la_simulacion_fallo_se_le_dice_al_modelo():
    modelo = _ModeloFalso(NetlistReparado(netlist=NETLIST_OK))

    repair_netlist(
        modelo,
        description="algo",
        metric="v_out",
        target=5.0,
        netlist=NETLIST_OK,
        measured=None,
        sim_error="ngspice exited with non-zero status",
    )

    texto = " ".join(m["content"] for m in modelo.mensajes)
    assert "ngspice exited with non-zero status" in texto


def test_un_fallo_del_modelo_se_tipa_como_ReparacionError():
    modelo = _ModeloFalso(RuntimeError("se cayó"))

    with pytest.raises(ReparacionError):
        repair_netlist(
            modelo,
            description="algo",
            metric="v_out",
            target=5.0,
            netlist=NETLIST_OK,
            measured=1.0,
            sim_error=None,
        )


def test_un_netlist_reparado_que_no_mide_nada_se_rechaza():
    """La misma guarda que en la entrada: si el modelo devuelve algo que no
    escribe output.txt, el shell no tendría nada que leer."""
    with pytest.raises(ValueError, match="output.txt"):
        NetlistReparado(netlist="* sin nada\n.control\nop\n.endc\n.end\n")
