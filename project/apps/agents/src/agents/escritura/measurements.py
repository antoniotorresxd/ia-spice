"""Pure ngspice measurement builders, independent of circuit topology.

DC/current use a one-point DC sweep of the assembler's isolated V__measure
source: ngspice has no `meas op`. Current is signed current through a named
voltage source. Ripple is steady-state peak-to-peak voltage. Gain is the
magnitude of output/input; cutoff is the first -3 dB crossing relative to
maximum gain in the sweep (not relative to the requested target).
"""
from dataclasses import dataclass

from agents.curador.policy import metric_key


@dataclass(frozen=True)
class MeasurementContext:
    key: str
    node: str
    input_node: str
    frequency: float = 1000.0
    tstep: float = 1e-6
    tstop: float = 0.005
    tstart: float = 0.003


def _transient(c: MeasurementContext, operation: str) -> list[str]:
    return [f"tran {c.tstep:g} {c.tstop:g} {c.tstart:g}",
            f"meas tran {c.key} {operation} v({c.node}) from={c.tstart:g} to={c.tstop:g}"]


def measure_max(c: MeasurementContext) -> list[str]:
    return _transient(c, "MAX")


def measure_min(c: MeasurementContext) -> list[str]:
    return _transient(c, "MIN")


def measure_peak_to_peak(c: MeasurementContext) -> list[str]:
    return _transient(c, "PP")


def measure_ripple(c: MeasurementContext) -> list[str]:
    return _transient(c, "PP")


def measure_dc(c: MeasurementContext) -> list[str]:
    # `.meas dc ... FIND ... AT=0` needs an actual interval to search within;
    # a zero-width sweep ("0 0 1") gives ngspice a single data row and it
    # reports "out of interval" even though the value it wants is that row.
    return ["dc V__measure 0 1 1", f"meas dc {c.key} FIND v({c.node}) AT=0"]


def measure_current(c: MeasurementContext) -> list[str]:
    return ["dc V__measure 0 1 1", f"meas dc {c.key} FIND i({c.node}) AT=0"]


def measure_gain_at_freq(c: MeasurementContext) -> list[str]:
    # Same "needs an interval" issue as measure_dc, but for an AC sweep: a
    # single-point sweep at exactly the target frequency still fails FIND/AT.
    # Bracket the target with a handful of points instead of asking for it
    # exactly.
    lo, hi = c.frequency * 0.9, c.frequency * 1.1
    return [f"ac lin 5 {lo:g} {hi:g}",
            f"let __gain = mag(v({c.node})/v({c.input_node}))",
            f"meas ac {c.key} FIND __gain AT={c.frequency:g}"]


def measure_fc_3db(c: MeasurementContext) -> list[str]:
    return ["ac dec 200 1 1e9", f"let __gain = mag(v({c.node})/v({c.input_node}))",
            "let __threshold = vecmax(__gain)/sqrt(2)",
            f"meas ac {c.key} WHEN __gain=__threshold CROSS=1"]


MEASURE_BUILDERS = {
    "max": measure_max, "min": measure_min, "peak_to_peak": measure_peak_to_peak,
    "dc": measure_dc, "current": measure_current, "fc_-3db": measure_fc_3db,
    "gain_at_freq": measure_gain_at_freq, "ripple": measure_ripple,
}


def measurement_commands(requirement: dict, *, node: str, input_node: str = "vin",
                         values: dict | None = None) -> list[str]:
    values = values or {}
    frequency = requirement.get("frequency_hz") or values.get("freq", 1000.0)
    context = MeasurementContext(
        metric_key(requirement), node, input_node, frequency,
        values.get("tstep", 1 / frequency / 1000),
        values.get("tstop", 5 / frequency), values.get("tstart", 3 / frequency),
    )
    measure = requirement["measure"]
    builder = MEASURE_BUILDERS.get(measure)
    if builder is None:
        raise ValueError(
            f"unknown measure {measure!r}; must be one of {sorted(MEASURE_BUILDERS)} "
            "(this closed vocabulary applies only to composed/Slice B requirements — "
            "a single-block Requirement without `node` keeps Slice A's free-form "
            "metric names, since those are legacy names read straight off each "
            "catalog template's own wrdata/echo output, not measurement types)"
        )
    return builder(context)
