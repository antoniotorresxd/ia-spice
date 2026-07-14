from PySpice.Spice.Netlist import Circuit


def build_voltage_divider_netlist(v_in: float, r1: float, r2: float) -> str:
    """Build a resistive voltage-divider netlist ready for ngspice batch mode.

    Appends a .control block that runs an operating-point analysis and
    writes v(vout) via wrdata, so the caller only needs to run
    `ngspice -b` on the returned text and read the wrdata output file.
    """
    circuit = Circuit("Voltage Divider")
    circuit.V("input", "vin", circuit.gnd, v_in)
    circuit.R(1, "vin", "vout", r1)
    circuit.R(2, "vout", circuit.gnd, r2)

    control_block = (
        ".control\n"
        "op\n"
        "wrdata output.txt v(vout)\n"
        ".endc\n"
        ".end\n"
    )
    return str(circuit) + control_block


def build_rc_lowpass_netlist(r: float, c: float) -> str:
    """RC pasa-bajas con análisis AC; mide la frecuencia de corte (-3 dB)
    con `meas` y la escribe a output.txt vía redirección de echo."""
    circuit = Circuit("RC Lowpass")
    circuit.V("input", "vin", circuit.gnd, "DC 0 AC 1")
    circuit.R(1, "vin", "vout", r)
    circuit.C(1, "vout", circuit.gnd, c)

    control_block = (
        ".control\n"
        "ac dec 100 1 1e9\n"
        "meas ac fc WHEN vdb(vout)=-3\n"
        "echo $&fc > output.txt\n"
        ".endc\n"
        ".end\n"
    )
    return str(circuit) + control_block


def build_led_resistor_netlist(v_in: float, r: float) -> str:
    """LED (diodo con modelo fijo) + resistencia limitadora; mide la
    corriente del lazo en el punto de operación."""
    circuit = Circuit("LED Resistor")
    circuit.V("input", "vin", circuit.gnd, v_in)
    circuit.R(1, "vin", "vled", r)
    circuit.D(1, "vled", circuit.gnd, model="LED")
    circuit.model("LED", "D", IS=1e-20, N=2)

    control_block = (
        ".control\n"
        "op\n"
        "let iled = -i(vinput)\n"
        "wrdata output.txt iled\n"
        ".endc\n"
        ".end\n"
    )
    return str(circuit) + control_block


# firma uniforme: (params_del_bloque, component_values_del_bloque) -> netlist
NETLIST_BUILDERS = {
    "voltage_divider": lambda params, values: build_voltage_divider_netlist(
        v_in=params["v_in"], r1=values["r1"], r2=values["r2"]
    ),
    "rc_lowpass": lambda params, values: build_rc_lowpass_netlist(
        r=values["r"], c=values["c"]
    ),
    "led_resistor": lambda params, values: build_led_resistor_netlist(
        v_in=params["v_in"], r=values["r"]
    ),
}
