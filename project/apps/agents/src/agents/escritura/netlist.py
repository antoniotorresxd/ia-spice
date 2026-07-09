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
