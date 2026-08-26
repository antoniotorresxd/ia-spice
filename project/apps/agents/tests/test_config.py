import pytest
import yaml

from agents.config import get_config, load_config, reset_config_cache


@pytest.fixture(autouse=True)
def _clean_cache():
    reset_config_cache()
    yield
    reset_config_cache()


def test_load_config_reads_the_shipped_file():
    cfg = load_config()

    assert cfg["curador"]["beta"] == 10.0
    assert cfg["curador"]["gamma"] == 3.0
    assert cfg["curador"]["weights"]["default"] == 1.0
    assert cfg["calculo"]["r_min"] == 1.0
    assert cfg["llm"]["temperature"] == 0.0


def test_load_config_accepts_an_explicit_path(tmp_path):
    custom = tmp_path / "otro.yaml"
    custom.write_text(yaml.safe_dump({"curador": {"beta": 99.0}}))

    assert load_config(custom)["curador"]["beta"] == 99.0


def test_env_var_overrides_the_path(tmp_path, monkeypatch):
    custom = tmp_path / "experimento.yaml"
    custom.write_text(yaml.safe_dump({"curador": {"gamma": 7.0}}))
    monkeypatch.setenv("CURADOR_CONFIG_PATH", str(custom))

    assert get_config()["curador"]["gamma"] == 7.0


def test_get_config_is_cached(tmp_path, monkeypatch):
    custom = tmp_path / "cacheada.yaml"
    custom.write_text(yaml.safe_dump({"curador": {"beta": 1.0}}))
    monkeypatch.setenv("CURADOR_CONFIG_PATH", str(custom))

    assert get_config()["curador"]["beta"] == 1.0
    custom.write_text(yaml.safe_dump({"curador": {"beta": 2.0}}))

    # sin reset, la segunda lectura devuelve lo cacheado
    assert get_config()["curador"]["beta"] == 1.0
    reset_config_cache()
    assert get_config()["curador"]["beta"] == 2.0


def test_missing_file_fails_loudly(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "no-existe.yaml")
