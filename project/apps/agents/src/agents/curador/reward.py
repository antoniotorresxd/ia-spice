"""La función de recompensa del curador.

    R = -Σᵢ (wᵢ · APEᵢ) + β·c - γ·n

APE va en PUNTOS PORCENTUALES: un error relativo de 0.25 es 25.0. La unidad
importa porque fija la escala de β y γ frente al término de error.
"""

Measurement = tuple[str, float]


def weight_for(metric: str, config: dict) -> float:
    weights = config["curador"]["weights"]
    return weights.get(metric, weights["default"])


def build_measurements(
    blocks: list[dict],
    evaluations: dict[str, tuple[str, float | None]],
    config: dict,
) -> list[Measurement]:
    """Arma la lista (métrica, APE) que consume la recompensa.

    Un bloque cuya simulación falló no tiene medición; se le imputa
    `failed_ape` porque dejarlo fuera de la suma haría que fallar saliera
    gratis y la recompensa premiaría no simular.
    """
    failed_ape = config["curador"]["failed_ape"]

    measurements: list[Measurement] = []
    for block in blocks:
        metric = block["goal"]["metric"]
        _, rel_err = evaluations[block["id"]]
        measurements.append(
            (metric, failed_ape if rel_err is None else rel_err * 100.0)
        )
    return measurements


def weighted_ape(measurements: list[Measurement], config: dict) -> float:
    """Σᵢ (wᵢ · APEᵢ) — el término de error de la recompensa, sin signo."""
    return sum(weight_for(metric, config) * ape for metric, ape in measurements)


def compute_reward(
    measurements: list[Measurement],
    converged: bool,
    iteration: int,
    config: dict,
) -> float:
    beta = config["curador"]["beta"]
    gamma = config["curador"]["gamma"]
    return (
        -weighted_ape(measurements, config)
        + beta * (1.0 if converged else 0.0)
        - gamma * iteration
    )
