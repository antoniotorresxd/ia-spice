"""Métricas de la evaluación. Funciones puras, sin E/S ni estado."""


def ape(medido: float, objetivo: float) -> float:
    """Error porcentual absoluto, en puntos porcentuales."""
    return abs(medido - objetivo) / abs(objetivo) * 100.0


def mape(apes: list[float]) -> float | None:
    """Error porcentual absoluto medio.

    Devuelve None sin mediciones, no cero: cero significaría error nulo, o sea
    perfección, que es lo contrario de no haber medido nada.
    """
    return sum(apes) / len(apes) if apes else None


def resumir(resultados: list[dict]) -> dict:
    """Agrega los resultados de una corrida completa del banco.

    Se reportan DOS tasas a propósito. `tasa_aceptada` es la fracción con
    veredicto favorable; `tasa_en_tolerancia` es la fracción que de verdad
    cumple la meta que declaró. El curador puede aceptar por recompensa un
    circuito ligeramente fuera de tolerancia, así que la segunda es la que va
    al capítulo de resultados como "tasa de circuitos que cumplen las metas".
    Publicar solo la primera inflaría el resultado.
    """
    total = len(resultados)
    if total == 0:
        return {
            "casos": 0,
            "medidos": 0,
            "sin_medicion": 0,
            "mape": None,
            "tasa_aceptada": 0.0,
            "tasa_en_tolerancia": 0.0,
            "iteraciones_medias": 0.0,
        }

    apes = [r["ape"] for r in resultados if r["ape"] is not None]

    return {
        "casos": total,
        "medidos": len(apes),
        "sin_medicion": total - len(apes),
        "mape": mape(apes),
        "tasa_aceptada": sum(r["estado"] == "accepted" for r in resultados) / total,
        "tasa_en_tolerancia": sum(r["en_tolerancia"] for r in resultados) / total,
        "iteraciones_medias": sum(r["iteraciones"] for r in resultados) / total,
    }
