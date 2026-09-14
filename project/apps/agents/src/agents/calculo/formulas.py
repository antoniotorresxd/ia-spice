def generic_values(params: dict) -> dict:
    """No hay nada que calcular: el netlist ya viene hecho.

    Se deja pasar por `component_values` a propósito, porque ese es el canal
    que el curador ya muta cuando decide ajustar. Un bloque genérico se corrige
    reemplazando su netlist, y así viaja por el mismo camino que los valores de
    los componentes de los tipos curados.
    """
    return {"netlist": params["netlist"]}


def catalog_values(params: dict) -> dict:
    """Resuelve o extrae los componentes para la topología del catálogo."""
    from agents.calculo.catalog_solver import solve_catalog_circuit

    circuit_id = params["circuit_id"]
    circuit_params = dict(params.get("params", {}))
    # Si viene target o metric suelto, mezclarlo en los parámetros
    if "target" in params and "target" not in circuit_params:
        circuit_params["target"] = params["target"]
    try:
        return solve_catalog_circuit(circuit_id, circuit_params)
    except Exception:
        return circuit_params


FORMULAS = {
    "generic": generic_values,
    "catalog": catalog_values,
}
