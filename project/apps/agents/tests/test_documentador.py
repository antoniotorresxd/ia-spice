from copy import deepcopy

import pytest

import agents.documentador.node as documentador_module
from agents.documentador.node import documentador_node
from agents.documentador.schema import CircuitDocumentation
from agents.llm.settings_client import LlmSettingsError

NETLIST_OK = (
    "* divisor\nVinput vin 0 10.0\nR1 vin vout 1000\nR2 vout 0 1000\n"
    ".control\nop\nwrdata output.txt v(vout)\n.endc\n.end\n"
)


class _ModeloFalso:
    """Imita lo justo de un chat model: with_structured_output(...).invoke(...)."""

    def __init__(self, resultado):
        self._resultado = resultado
        self.mensajes_por_llamada = []

    def with_structured_output(self, schema):
        assert schema is CircuitDocumentation
        return self

    def invoke(self, mensajes):
        self.mensajes_por_llamada.append(mensajes)
        if isinstance(self._resultado, Exception):
            raise self._resultado
        return self._resultado


def _state():
    return {
        "normalized_spec": {
            "blocks": [{
                "id": "b1",
                "type": "generic",
                "params": {"description": "un divisor"},
                "goal": {"metric": "v_out", "target": 5.0},
            }]
        },
        "netlists": {"b1": {"text": NETLIST_OK}},
        "sim_results": {
            "b1": {"metrics": {"v_out": 5.0}, "sim_error": None, "converged": True}
        },
    }


def _documentation(**kwargs):
    return CircuitDocumentation(
        summary="Reduce el voltaje",
        tags=["divisor"],
        components=kwargs.get("components", {"R1": "limita corriente"}),
        measurement_explanation="mide v_out",
    )


def test_documentador_devuelve_la_documentacion(monkeypatch):
    doc = _documentation()
    modelo = _ModeloFalso(doc)
    monkeypatch.setattr(documentador_module, "get_chat_model", lambda user_id: modelo)

    result = documentador_node(_state(), {"configurable": {"user_id": "u1"}})

    assert result == {"documentation": {"b1": doc.model_dump()}}
    texto = modelo.mensajes_por_llamada[0][1]["content"]
    assert "un divisor" in texto
    assert NETLIST_OK in texto
    assert "Se midió v_out = 5.0" in texto


def test_documentador_descarta_componentes_inventados(monkeypatch):
    modelo = _ModeloFalso(_documentation(components={"R1": "limita corriente", "FAKE": "no existe"}))
    monkeypatch.setattr(documentador_module, "get_chat_model", lambda user_id: modelo)

    result = documentador_node(_state(), {"configurable": {"user_id": "u1"}})

    assert result["documentation"]["b1"]["components"] == {"R1": "limita corriente"}


@pytest.mark.parametrize("error", [LlmSettingsError("no llm configured"), RuntimeError("falló la fábrica")])
def test_sin_configuracion_todos_los_bloques_quedan_en_none(monkeypatch, error):
    llamadas = []

    def _fallar(user_id):
        llamadas.append(user_id)
        raise error

    monkeypatch.setattr(documentador_module, "get_chat_model", _fallar)
    state = _state()
    otro = deepcopy(state["normalized_spec"]["blocks"][0])
    otro["id"] = "b2"
    state["normalized_spec"]["blocks"].append(otro)
    state["netlists"]["b2"] = {"text": NETLIST_OK}

    result = documentador_node(state, {"configurable": {"user_id": "u1"}})

    assert result == {"documentation": {"b1": None, "b2": None}}
    assert llamadas == ["u1"]


def test_sin_user_id_el_bloque_queda_en_none():
    assert documentador_node(_state(), None) == {"documentation": {"b1": None}}


@pytest.mark.parametrize("resultado", [RuntimeError("se cayó"), None, {"summary": "incompleto"}])
def test_un_fallo_del_modelo_no_se_propaga(monkeypatch, resultado):
    monkeypatch.setattr(documentador_module, "get_chat_model", lambda user_id: _ModeloFalso(resultado))

    assert documentador_node(_state(), {"configurable": {"user_id": "u1"}}) == {
        "documentation": {"b1": None}
    }


def test_un_fallo_de_bloque_no_impide_documentar_el_siguiente(monkeypatch):
    """El modelo se resuelve una sola vez; cada bloque falla por separado."""
    doc = _documentation()

    class _ModeloSecuencial(_ModeloFalso):
        def invoke(self, mensajes):
            if not self.mensajes_por_llamada:
                self.mensajes_por_llamada.append(mensajes)
                raise RuntimeError("falló el primer bloque")
            return super().invoke(mensajes)

    modelo = _ModeloSecuencial(doc)
    llamadas = []

    def _resolver(user_id):
        llamadas.append(user_id)
        return modelo

    monkeypatch.setattr(documentador_module, "get_chat_model", _resolver)
    state = _state()
    otro = deepcopy(state["normalized_spec"]["blocks"][0])
    otro["id"] = "b2"
    state["normalized_spec"]["blocks"].append(otro)
    state["netlists"]["b2"] = {"text": NETLIST_OK}

    result = documentador_node(state, {"configurable": {"user_id": "u1"}})

    assert result == {"documentation": {"b1": None, "b2": doc.model_dump()}}
    assert llamadas == ["u1"]
    assert len(modelo.mensajes_por_llamada) == 2


def test_el_prompt_incluye_el_error_y_el_tipo_si_no_hay_descripcion(monkeypatch):
    modelo = _ModeloFalso(_documentation())
    monkeypatch.setattr(documentador_module, "get_chat_model", lambda user_id: modelo)
    state = _state()
    state["normalized_spec"]["blocks"][0]["params"] = {}
    state["sim_results"]["b1"] = {"metrics": None, "sim_error": "no converge"}

    result = documentador_node(state, {"configurable": {"user_id": "u1"}})

    assert result["documentation"]["b1"] is not None
    texto = modelo.mensajes_por_llamada[0][1]["content"]
    assert "Circuito: generic" in texto
    assert "La simulación falló: no converge" in texto


def test_solo_se_documentan_bloques_con_netlist(monkeypatch):
    modelo = _ModeloFalso(_documentation())
    monkeypatch.setattr(documentador_module, "get_chat_model", lambda user_id: modelo)
    state = _state()
    state["normalized_spec"]["blocks"].append({"id": "sin_netlist"})

    result = documentador_node(state, {"configurable": {"user_id": "u1"}})

    assert set(result["documentation"]) == {"b1"}
    assert len(modelo.mensajes_por_llamada) == 1
