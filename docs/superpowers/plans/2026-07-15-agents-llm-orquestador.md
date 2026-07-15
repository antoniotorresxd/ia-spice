# LLM en el orquestador de agents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El orquestador acepta lenguaje natural (`request_text`) y usa el LLM activo (resuelto vía el server, nunca configurado en agents) para producir el `CircuitSpec` que ya existe; el camino estructurado (`circuit_spec`) queda intacto, según `docs/superpowers/specs/2026-07-13-agents-llm-orquestador-design.md`.

**Architecture:** Nuevo módulo `src/agents/llm/` (settings_client con cache TTL, factory multi-provider sobre `init_chat_model`, extraction con `.with_structured_output`). `orquestador_node` se extiende con una rama dual: `request_text` → LLM → `CircuitSpec` → normalización existente; `circuit_spec` → camino actual sin cambios. El chat model es inyectable (`get_chat_model()` a nivel de módulo) para poder testear sin red.

**Tech Stack:** Python 3.12, uv, `httpx` (nuevo), `langchain` + `langchain-anthropic` + `langchain-openai` + `langchain-google-genai` (nuevos), Pydantic, pytest. ngspice real donde ya se usaba; el LLM se fakea en tests (es una dependencia de red, no una herramienta local).

**Working directory:** todos los comandos se corren desde `project/apps/agents/`. Usa `~/.bun/bin/bun`-equivalente para Python: dentro de WSL, `uv` normal (`wsl.exe -d debian -- bash -lc "cd /home/antonioxd/projects/spice/project/apps/agents && <cmd>"`).

**Contrato con el server (ya implementado y verificado):** `GET {SERVER_BASE_URL}/api/internal/llm/active` con header `Authorization: Bearer <AGENTS_SERVICE_TOKEN>` → `200 {"provider", "model", "api_key", "base_url"}` | `404` sin activa | `401` token inválido.

---

### Task 1: Dependencias y variables de entorno

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Agregar dependencias**

```bash
uv add httpx langchain-anthropic langchain-openai langchain-google-genai
```

- [ ] **Step 2: Documentar las env vars nuevas (no hace falta código, solo confirmarlas)**

`SERVER_BASE_URL` (ej. `http://localhost:3001`) y `AGENTS_SERVICE_TOKEN` (el mismo valor que el server tiene en su `.env`) — se leen con `os.environ` directo en el cliente de settings (Task 2), sin librería de settings nueva. Agrega ambas a `project/apps/agents/.env` localmente (no se commitea) para las pruebas manuales del final del plan.

- [ ] **Step 3: Correr la suite existente para confirmar que nada se rompió**

Run: `uv run pytest -v`
Expected: PASS — 49 tests (los de la iteración 2, sin tocar).

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "feat(agents): dependencias httpx y langchain-* para LLM multi-provider"
```

---

### Task 2: Cliente de settings del server

**Files:**
- Create: `src/agents/llm/__init__.py` (vacío)
- Create: `src/agents/llm/settings_client.py`
- Test: `tests/test_settings_client.py`

- [ ] **Step 1: Escribir los tests (servidor HTTP fake local, sin red real)**

`tests/test_settings_client.py`:

```python
import time

import httpx
import pytest

from agents.llm.settings_client import (
    ActiveLlmConfig,
    LlmSettingsError,
    fetch_active_llm,
)


def _transport(handler):
    return httpx.MockTransport(handler)


def _ok_handler(request):
    return httpx.Response(
        200,
        json={
            "provider": "anthropic",
            "model": "claude-sonnet-5",
            "api_key": "sk-ant-test",
            "base_url": None,
        },
    )


def test_fetch_active_llm_parses_valid_response():
    config = fetch_active_llm(
        base_url="http://server.test",
        token="tok",
        transport=_transport(_ok_handler),
    )
    assert config == ActiveLlmConfig(
        provider="anthropic",
        model="claude-sonnet-5",
        api_key="sk-ant-test",
        base_url=None,
    )


def test_fetch_active_llm_sends_bearer_token():
    seen = {}

    def handler(request):
        seen["auth"] = request.headers.get("authorization")
        return _ok_handler(request)

    fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))
    assert seen["auth"] == "Bearer tok"


def test_fetch_active_llm_404_raises_typed_error():
    def handler(request):
        return httpx.Response(404, json={"error": "No active LLM configured"})

    with pytest.raises(LlmSettingsError, match="no active LLM"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_fetch_active_llm_401_raises_typed_error():
    def handler(request):
        return httpx.Response(401, json={"error": "Unauthorized"})

    with pytest.raises(LlmSettingsError, match="unauthorized"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_fetch_active_llm_malformed_payload_raises_typed_error():
    def handler(request):
        return httpx.Response(200, json={"provider": "anthropic"})  # faltan campos

    with pytest.raises(LlmSettingsError, match="invalid payload"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_fetch_active_llm_connection_error_raises_typed_error():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(LlmSettingsError, match="unreachable"):
        fetch_active_llm(base_url="http://server.test", token="tok", transport=_transport(handler))


def test_cache_avoids_second_fetch_within_ttl():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="ttl-test")
    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="ttl-test")
    assert calls["n"] == 1


def test_cache_expires_after_ttl(monkeypatch):
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _ok_handler(request)

    transport = _transport(handler)
    fake_time = {"t": 1000.0}
    monkeypatch.setattr(time, "monotonic", lambda: fake_time["t"])

    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="expiry-test")
    fake_time["t"] += 61.0
    fetch_active_llm(base_url="http://server.test", token="tok", transport=transport, cache_key="expiry-test")
    assert calls["n"] == 2
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_settings_client.py -v`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/agents/llm/settings_client.py`:

```python
import os
import time

import httpx
from pydantic import BaseModel, ValidationError


class ActiveLlmConfig(BaseModel):
    provider: str
    model: str
    api_key: str | None
    base_url: str | None


class LlmSettingsError(Exception):
    """Fallo al resolver el LLM activo desde el server. Nunca se propaga
    como excepción no capturada fuera del orquestador."""


_CACHE: dict[str, tuple[float, ActiveLlmConfig]] = {}
_CACHE_TTL_SECONDS = 60.0


def fetch_active_llm(
    base_url: str | None = None,
    token: str | None = None,
    transport: httpx.BaseTransport | None = None,
    cache_key: str = "default",
) -> ActiveLlmConfig:
    """Obtiene el LLM activo desde el server, con cache en memoria (TTL 60s).

    `transport` es inyectable para tests (httpx.MockTransport); en
    producción se usa el transport HTTP real de httpx.
    """
    now = time.monotonic()
    cached = _CACHE.get(cache_key)
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    base_url = base_url or os.environ.get("SERVER_BASE_URL")
    token = token or os.environ.get("AGENTS_SERVICE_TOKEN")
    if not base_url or not token:
        raise LlmSettingsError(
            "SERVER_BASE_URL / AGENTS_SERVICE_TOKEN not configured"
        )

    client_kwargs = {"transport": transport} if transport is not None else {}
    try:
        with httpx.Client(**client_kwargs, timeout=5.0) as client:
            response = client.get(
                f"{base_url}/api/internal/llm/active",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.ConnectError as exc:
        raise LlmSettingsError(f"server unreachable: {exc}") from exc
    except httpx.TimeoutException as exc:
        raise LlmSettingsError(f"server timeout: {exc}") from exc

    if response.status_code == 404:
        raise LlmSettingsError("no active LLM configured on the server")
    if response.status_code == 401:
        raise LlmSettingsError("unauthorized: invalid AGENTS_SERVICE_TOKEN")
    if response.status_code != 200:
        raise LlmSettingsError(f"unexpected status {response.status_code} from server")

    try:
        config = ActiveLlmConfig.model_validate(response.json())
    except ValidationError as exc:
        raise LlmSettingsError(f"invalid payload from server: {exc}") from exc

    _CACHE[cache_key] = (now, config)
    return config
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_settings_client.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agents/llm/__init__.py src/agents/llm/settings_client.py tests/test_settings_client.py
git commit -m "feat(agents): cliente de settings LLM con cache TTL contra el server"
```

---

### Task 3: Factory del chat model multi-provider

**Files:**
- Create: `src/agents/llm/factory.py`
- Test: `tests/test_factory.py`

- [ ] **Step 1: Escribir los tests (solo construcción, sin llamar APIs)**

`tests/test_factory.py`:

```python
import pytest

from agents.llm.factory import UnsupportedProviderError, build_chat_model
from agents.llm.settings_client import ActiveLlmConfig


def test_build_chat_model_anthropic():
    model = build_chat_model(
        ActiveLlmConfig(provider="anthropic", model="claude-sonnet-5", api_key="k", base_url=None)
    )
    assert model is not None


def test_build_chat_model_openai():
    model = build_chat_model(
        ActiveLlmConfig(provider="openai", model="gpt-4o", api_key="k", base_url=None)
    )
    assert model is not None


def test_build_chat_model_google():
    model = build_chat_model(
        ActiveLlmConfig(provider="google", model="gemini-2.0-flash", api_key="k", base_url=None)
    )
    assert model is not None


def test_build_chat_model_openai_compatible_with_base_url():
    model = build_chat_model(
        ActiveLlmConfig(
            provider="openai_compatible",
            model="llama3.1:8b",
            api_key=None,
            base_url="http://localhost:11434/v1",
        )
    )
    assert model is not None


def test_build_chat_model_unsupported_provider_raises():
    with pytest.raises(UnsupportedProviderError):
        build_chat_model(
            ActiveLlmConfig(provider="not_a_provider", model="x", api_key="k", base_url=None)
        )
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_factory.py -v`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/agents/llm/factory.py`:

```python
from langchain.chat_models import init_chat_model

from agents.llm.settings_client import ActiveLlmConfig

_PROVIDER_MAP = {
    "anthropic": "anthropic",
    "openai": "openai",
    "google": "google_genai",
    "openai_compatible": "openai",
}


class UnsupportedProviderError(Exception):
    pass


def build_chat_model(config: ActiveLlmConfig):
    if config.provider not in _PROVIDER_MAP:
        raise UnsupportedProviderError(f"unsupported provider: {config.provider}")

    kwargs: dict = {
        "model": config.model,
        "model_provider": _PROVIDER_MAP[config.provider],
    }
    # api_key es opcional para openai_compatible (algunos endpoints locales
    # no exigen key); init_chat_model requiere un valor no vacío igual.
    kwargs["api_key"] = config.api_key or "not-required"
    if config.provider == "openai_compatible":
        kwargs["base_url"] = config.base_url

    return init_chat_model(**kwargs)
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_factory.py -v`
Expected: PASS (5 tests). Si `init_chat_model` intenta validar la key contra la red al construir el objeto (no debería — la mayoría de integraciones LangChain son lazy), y algún test falla por eso, ajusta el test para mockear el constructor subyacente del provider en vez de invocar `init_chat_model` real; documenta el cambio si ocurre.

- [ ] **Step 5: Commit**

```bash
git add src/agents/llm/factory.py tests/test_factory.py
git commit -m "feat(agents): factory de chat model multi-provider via init_chat_model"
```

---

### Task 4: Extracción de CircuitSpec desde texto libre

**Files:**
- Create: `src/agents/llm/extraction.py`
- Test: `tests/test_extraction.py`

- [ ] **Step 1: Escribir los tests (chat model fake, sin red)**

`tests/test_extraction.py`:

```python
import pytest

from agents.llm.extraction import ExtractionError, extract_circuit_spec
from agents.orquestador.schema import CircuitSpec


class _FakeStructuredModel:
    def __init__(self, result):
        self._result = result

    def invoke(self, messages):
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


class _FakeChatModel:
    def __init__(self, result):
        self._result = result

    def with_structured_output(self, schema):
        assert schema is CircuitSpec
        return _FakeStructuredModel(self._result)


FIXED_SPEC = CircuitSpec(
    blocks=[
        {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
    ]
)


def test_extract_circuit_spec_returns_parsed_spec():
    chat_model = _FakeChatModel(FIXED_SPEC)
    result = extract_circuit_spec(chat_model, "dame un divisor de 5V a 3.3V")
    assert result == FIXED_SPEC


def test_extract_circuit_spec_wraps_failures():
    chat_model = _FakeChatModel(RuntimeError("boom"))
    with pytest.raises(ExtractionError, match="boom"):
        extract_circuit_spec(chat_model, "algo")
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `uv run pytest tests/test_extraction.py -v`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/agents/llm/extraction.py`:

```python
from agents.orquestador.schema import CircuitSpec

_SYSTEM_PROMPT = """\
Eres un asistente que convierte descripciones en lenguaje natural de \
circuitos electrónicos analógicos en una especificación estructurada.

Tipos de circuito soportados, con sus parámetros (todos en unidades SI \
salvo que se indique):
- voltage_divider: divisor de voltaje resistivo. params: v_in (V), \
  v_out objetivo (V).
- rc_lowpass: filtro RC pasa-bajas. params: f_c objetivo, frecuencia de \
  corte (Hz).
- led_resistor: LED con resistencia limitadora. params: v_in (V), v_f, \
  voltage forward del LED (V), i_led objetivo, corriente (A).

Cada bloque del circuito necesita un "id" único de tu elección (string \
corto, ej. "div1"). Si el usuario no especifica tolerancia ni número \
máximo de iteraciones, omite esos campos (tienen defaults). Devuelve \
únicamente la especificación estructurada, sin explicación adicional.
"""


class ExtractionError(Exception):
    """El LLM no produjo una CircuitSpec válida."""


def extract_circuit_spec(chat_model, request_text: str) -> CircuitSpec:
    structured_model = chat_model.with_structured_output(CircuitSpec)
    try:
        result = structured_model.invoke(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": request_text},
            ]
        )
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del LLM se tipa
        raise ExtractionError(f"LLM extraction failed: {exc}") from exc

    if not isinstance(result, CircuitSpec):
        raise ExtractionError(f"LLM returned unexpected type: {type(result)}")

    return result
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_extraction.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agents/llm/extraction.py tests/test_extraction.py
git commit -m "feat(agents): extraccion de CircuitSpec desde texto libre via LLM"
```

---

### Task 5: Estado dual y orquestador con camino LLM

**Files:**
- Modify: `src/agents/state.py` (agregar `request_text`)
- Modify: `src/agents/orquestador/node.py` (rama dual + `get_chat_model` inyectable)
- Modify: `tests/test_orquestador.py` (actualizar `_state()`, agregar tests del camino LLM)
- Modify: todos los demás `_state`/`_initial_state`/`_pipeline_state` helpers en `tests/` que construyen un `CircuitState` a mano (agregar `"request_text": None`)

- [ ] **Step 1: Agregar el campo al estado**

En `src/agents/state.py`, agregar dentro de `CircuitState`, junto a `circuit_spec`:

```python
    # Entrada cruda del caller (uno de los dos, o ambos — ver orquestador)
    circuit_spec: dict
    request_text: str | None
```

- [ ] **Step 2: Actualizar los tests existentes que construyen el estado a mano**

Los archivos `tests/test_orquestador.py`, `tests/test_calculo.py`, `tests/test_netlist.py`, `tests/test_ngspice_runner.py`, `tests/test_sintesis.py`, `tests/test_curador.py`, `tests/test_graph.py` construyen `CircuitState` a mano con un dict literal. `CircuitState` es un `TypedDict`, así que en runtime Python NO falla si falta una key — pero para mantener los fixtures honestos, agrega `"request_text": None,` junto a cada `"circuit_spec": ...,` en esos helpers. Localízalos con:

```bash
grep -rn '"circuit_spec":' tests/
```

Y agrega la línea `"request_text": None,` inmediatamente después en cada ocurrencia dentro de un dict literal de estado (no en los `normalized_spec["blocks"]`, que son otra cosa — revisa cada match).

- [ ] **Step 3: Escribir los tests del camino LLM en el orquestador**

Agregar a `tests/test_orquestador.py` (mantener los tests existentes, solo actualizar `_state()` con el nuevo campo):

```python
def _state(circuit_spec=None, request_text=None):
    return {
        "circuit_spec": circuit_spec or {},
        "request_text": request_text,
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }
```

(Ajusta las llamadas existentes que hacían `_state(VALID_SPEC)` a `_state(circuit_spec=VALID_SPEC)` si la firma posicional cambia de orden — o mantenla como primer parámetro posicional como está arriba, que preserva `_state(VALID_SPEC)` funcionando igual.)

Agregar al final del archivo:

```python
from unittest.mock import MagicMock

import agents.orquestador.node as orquestador_module


def test_request_text_uses_llm_to_produce_normalized_spec(monkeypatch):
    fake_spec = {
        "blocks": [
            {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
        ]
    }
    from agents.orquestador.schema import CircuitSpec

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda: MagicMock())
    monkeypatch.setattr(
        orquestador_module,
        "extract_circuit_spec",
        lambda chat_model, text: CircuitSpec.model_validate(fake_spec),
    )

    result = orquestador_node(_state(request_text="dame un divisor de 5V a 3.3V"))

    assert result["normalized_spec"]["blocks"][0]["id"] == "div1"
    assert result["circuit_spec"] == fake_spec
    assert result["pending_blocks"] == ["div1"]


def test_request_text_llm_settings_failure_is_rejected(monkeypatch):
    from agents.llm.settings_client import LlmSettingsError

    def _raise():
        raise LlmSettingsError("server unreachable: boom")

    monkeypatch.setattr(orquestador_module, "get_chat_model", _raise)

    result = orquestador_node(_state(request_text="algo"))

    assert result["verdict"]["status"] == "rejected"
    assert "llm_settings_unavailable" in result["verdict"]["reason"]


def test_request_text_extraction_failure_is_rejected(monkeypatch):
    from agents.llm.extraction import ExtractionError

    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda: MagicMock())

    def _raise(chat_model, text):
        raise ExtractionError("LLM returned garbage")

    monkeypatch.setattr(orquestador_module, "extract_circuit_spec", _raise)

    result = orquestador_node(_state(request_text="algo"))

    assert result["verdict"]["status"] == "rejected"
    assert "llm_extraction_failed" in result["verdict"]["reason"]


def test_no_input_at_all_is_rejected():
    result = orquestador_node(_state())

    assert result["verdict"]["status"] == "rejected"
    assert "no input" in result["verdict"]["reason"]


def test_circuit_spec_path_still_works_when_request_text_is_none():
    # camino estructurado (Task 2 de la iteracion 2), intacto
    result = orquestador_node(_state(circuit_spec=VALID_SPEC))
    assert result["normalized_spec"]["blocks"][0]["id"] == "div1"
```

- [ ] **Step 4: Correr y verificar que falla**

Run: `uv run pytest tests/test_orquestador.py -v`
Expected: FAIL — `orquestador_node` no conoce `request_text`, y `get_chat_model`/`extract_circuit_spec` no existen en el módulo.

- [ ] **Step 5: Reescribir el orquestador**

`src/agents/orquestador/node.py` (reemplazo completo):

```python
from pydantic import ValidationError

from agents.llm.extraction import ExtractionError, extract_circuit_spec
from agents.llm.factory import build_chat_model
from agents.llm.settings_client import LlmSettingsError, fetch_active_llm
from agents.orquestador.schema import CircuitSpec
from agents.state import CircuitState

# metric name y de qué parámetro sale el target, por tipo de circuito
_GOALS = {
    "voltage_divider": ("v_out", "v_out"),
    "rc_lowpass": ("f_c", "f_c"),
    "led_resistor": ("i_led", "i_led"),
}


def get_chat_model():
    """Resuelve el LLM activo desde el server y construye el chat model.

    Punto de indirección a nivel de módulo: los tests lo sustituyen (monkeypatch)
    por un fake para no depender de red ni del server.
    """
    config = fetch_active_llm()
    return build_chat_model(config)


def _rejected(reason: str) -> dict:
    return {
        "verdict": {"status": "rejected", "reason": reason, "best_iteration": None}
    }


def _normalize(spec: CircuitSpec) -> dict:
    blocks = []
    for block in spec.blocks:
        params = block.params.model_dump()
        metric, target_param = _GOALS[block.type]
        blocks.append(
            {
                "id": block.id,
                "type": block.type,
                "params": params,
                "goal": {
                    "metric": metric,
                    "target": params[target_param],
                    "tolerance": spec.tolerance,
                },
            }
        )
    return {
        "normalized_spec": {"blocks": blocks, "max_iterations": spec.max_iterations},
        "pending_blocks": [b["id"] for b in blocks],
        "iteration": 0,
    }


def orquestador_node(state: CircuitState) -> dict:
    request_text = state.get("request_text")
    circuit_spec = state.get("circuit_spec")

    if request_text:
        try:
            chat_model = get_chat_model()
        except LlmSettingsError as exc:
            return _rejected(f"llm_settings_unavailable: {exc}")

        try:
            spec = extract_circuit_spec(chat_model, request_text)
        except ExtractionError as exc:
            return _rejected(f"llm_extraction_failed: {exc}")

        result = _normalize(spec)
        # se sobreescribe circuit_spec con lo que el LLM entendió, para que
        # history/depuración muestren la especificación resuelta
        result["circuit_spec"] = spec.model_dump(mode="json")
        return result

    if circuit_spec:
        try:
            spec = CircuitSpec.model_validate(circuit_spec)
        except ValidationError as exc:
            return _rejected(f"invalid circuit_spec: {exc}")
        return _normalize(spec)

    return _rejected("no input provided: neither request_text nor circuit_spec")


def route_after_orquestador(state: CircuitState) -> str:
    return "reject" if state["verdict"] is not None else "continue"
```

- [ ] **Step 6: Correr los tests**

Run: `uv run pytest tests/test_orquestador.py -v`
Expected: PASS (todos: los 6 existentes de la iteración 2 + los 5 nuevos = 11).

- [ ] **Step 7: Correr la suite completa**

Run: `uv run pytest -v`
Expected: PASS. Si algún test de `test_calculo.py`/`test_sintesis.py`/`test_curador.py`/`test_graph.py` falla por faltarle `request_text` en su fixture de estado manual, complétalo (Step 2 de esta task ya debería haberlos cubierto — verifica con el grep si quedó alguno).

- [ ] **Step 8: Commit**

```bash
git add src/agents/state.py src/agents/orquestador/node.py tests/
git commit -m "feat(agents): orquestador dual - request_text via LLM o circuit_spec estructurado"
```

---

### Task 6: E2E con LLM fake + ngspice real, y marca opcional con LLM vivo

**Files:**
- Modify: `tests/test_graph.py` (agregar e2e con LLM fake)
- Modify: `pyproject.toml` (registrar el marker `live_llm`)

- [ ] **Step 1: Registrar el marker**

En `pyproject.toml`, agregar dentro de `[tool.pytest.ini_options]`:

```toml
markers = [
    "live_llm: requiere SERVER_BASE_URL/AGENTS_SERVICE_TOKEN y un LLM activo real (se salta si no están configurados)",
]
```

- [ ] **Step 2: Escribir el e2e con LLM fake (ngspice real)**

Agregar a `tests/test_graph.py`:

```python
from unittest.mock import MagicMock

import agents.orquestador.node as orquestador_module
from agents.orquestador.schema import CircuitSpec


def test_request_text_end_to_end_with_fake_llm(monkeypatch):
    fake_spec = CircuitSpec.model_validate(
        {
            "blocks": [
                {"id": "div1", "type": "voltage_divider", "params": {"v_in": 5.0, "v_out": 3.3}}
            ]
        }
    )
    monkeypatch.setattr(orquestador_module, "get_chat_model", lambda: MagicMock())
    monkeypatch.setattr(
        orquestador_module, "extract_circuit_spec", lambda chat_model, text: fake_spec
    )

    spec = {"blocks": []}  # circuit_spec vacio: se ignora porque hay request_text
    graph = build_graph()
    config = {"configurable": {"thread_id": "e2e-request-text"}}
    initial_state = {
        "circuit_spec": spec,
        "request_text": "dame un divisor de 5V a 3.3V",
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final = graph.invoke(initial_state, config)

    assert final["verdict"]["status"] == "accepted"
    v_out = final["sim_results"]["div1"]["metrics"]["v_out"]
    assert v_out == pytest.approx(3.3, rel=0.05)
```

(`build_graph` y `pytest` ya están importados al inicio de `tests/test_graph.py` desde la iteración 2 — confirma antes de agregar imports duplicados.)

- [ ] **Step 3: Escribir el e2e opcional con LLM vivo (se salta sin config)**

Agregar también a `tests/test_graph.py`:

```python
import os


@pytest.mark.live_llm
@pytest.mark.skipif(
    not (os.environ.get("SERVER_BASE_URL") and os.environ.get("AGENTS_SERVICE_TOKEN")),
    reason="requires a running server with SERVER_BASE_URL/AGENTS_SERVICE_TOKEN and an active LLM",
)
def test_request_text_end_to_end_with_live_llm():
    graph = build_graph()
    config = {"configurable": {"thread_id": "e2e-live-llm"}}
    initial_state = {
        "circuit_spec": {},
        "request_text": "Necesito un divisor de voltaje que baje 5V a 3.3V",
        "normalized_spec": None,
        "pending_blocks": None,
        "component_values": {},
        "netlists": {},
        "sim_results": {},
        "iteration": 0,
        "history": [],
        "verdict": None,
    }

    final = graph.invoke(initial_state, config)

    assert final["verdict"]["status"] == "accepted"
```

- [ ] **Step 4: Correr los tests**

Run: `uv run pytest tests/test_graph.py -v`
Expected: PASS para el fake (real ngspice de por medio); el `live_llm` se salta (a menos que tengas el server corriendo con un LLM activo real — en ese caso también debería pasar, es tu verificación manual).

- [ ] **Step 5: Correr la suite completa**

Run: `uv run pytest -v`
Expected: PASS — todo el proyecto (iteración 2 + iteración 3), salvo el `live_llm` que se salta por default.

- [ ] **Step 6: Commit**

```bash
git add tests/test_graph.py pyproject.toml
git commit -m "test(agents): e2e del camino LLM (fake + marker live_llm opcional)"
```

---

### Task 7: Documentación

**Files:**
- Modify: `CLAUDE.md` (raíz — sección Agents)
- Modify: `project/apps/agents/README.md`

- [ ] **Step 1: Actualizar `CLAUDE.md`**

En el párrafo "Architecture" de la sección Agents, después de la frase sobre `orquestador (Pydantic validation/normalization...)`, agregar una oración: el orquestador ahora acepta también `request_text` (lenguaje natural), resuelto vía un LLM cuya configuración activa se obtiene del server (`GET /api/internal/llm/active`, con cache de 60s) — nunca configurado directamente en agents; `circuit_spec` estructurado sigue siendo el camino alterno intacto. Mencionar el nuevo módulo `src/agents/llm/` (settings_client, factory, extraction) y las env vars `SERVER_BASE_URL`/`AGENTS_SERVICE_TOKEN`.

Actualizar también la frase final del párrafo que dice "LLM-based NL extraction in the orquestador ... are not implemented yet" — ya no aplica para el orquestador (sigue aplicando para el curador/RL).

- [ ] **Step 2: Actualizar el README de agents**

Agregar una sección corta "LLM configuration" explicando que el LLM activo se resuelve desde el server (no se configura acá), con las dos env vars requeridas para el camino `request_text`, y que sin ellas el camino `circuit_spec` estructurado sigue funcionando igual.

- [ ] **Step 3: Correr la suite una última vez**

Run: `uv run pytest -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md project/apps/agents/README.md
git commit -m "docs: LLM en el orquestador de agents en CLAUDE.md y README"
```

---

### Task 8: Verificación manual end-to-end con el server real

**Files:** ninguno (solo verificación, sin cambios de código)

- [ ] **Step 1: Levantar el server con un LLM activo**

Con el server corriendo (`bun run dev` en `project/apps/server`) y una configuración `openai_compatible` (o cualquier provider con key real que tengas) creada y activada vía `/api/llm` (repite el flujo de verificación del plan del server), confirma `GET /api/internal/llm/active` responde 200.

- [ ] **Step 2: Correr el e2e con LLM vivo**

```bash
SERVER_BASE_URL=http://localhost:3001 AGENTS_SERVICE_TOKEN=<token> \
  uv run pytest tests/test_graph.py -v -m live_llm
```

Expected: PASS — el LLM real extrae el `CircuitSpec` desde "Necesito un divisor de voltaje que baje 5V a 3.3V" y el pipeline completo converge.

- [ ] **Step 3: Si falla, diagnosticar sin tocar producción**

Si el LLM no soporta `with_structured_output` bien (algunos modelos open source vía Ollama son inconsistentes con tool calling), documenta el resultado — no es necesariamente un bug del código, puede ser una limitación del modelo elegido. Prueba con otro provider/modelo activado en el server para aislar si es el pipeline o el modelo.

- [ ] **Step 4: Reportar el resultado al usuario (sin commit — esta task es solo verificación)**
