vin_name = ""
for element in circuit.elements:
    if "vin" in [str(pin.node).lower() for pin in element.pins] and element.name.lower().startswith("v"):
        vin_name = element.name


bias_voltage = [BIAS_VOLTAGE]

if vin_name != "":
    circuit.element(vin_name).detach()
    circuit.V('pulse', 'Vin', circuit.gnd, f"dc {bias_voltage} PULSE({bias_voltage-0.5} {bias_voltage+0.5} 1u 1u 1u 10m 20m)")
else:
    circuit.V('in', 'Vin', circuit.gnd, f"dc {bias_voltage} PULSE({bias_voltage-0.5} {bias_voltage+0.5} 1u 1u 1u 10m 20m)")

for element in circuit.elements:
    if element.name.lower().startswith("r1") or element.name.lower().startswith("rr1"):
        r_name = element.name
# [ADAPTADO A2] El verificador fija una R y un C a valores propios. Las
# demás resistencias del diseño se escalan en la misma proporción que la R
# fijada, para conservar las relaciones del diseño (p. ej. Rf/Rin).
def _ohms(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        try:
            return float(getattr(valor, "value", valor)) * getattr(valor, "scale", 1)
        except Exception:
            return None
_r_previa = _ohms(circuit.element(r_name).resistance)
circuit.element(r_name).resistance = "10k"
if _r_previa:
    _k = 10e3 / _r_previa
    for _e in circuit.elements:
        if _e.name != r_name and _e.name.lower().startswith("r") and hasattr(_e, "resistance"):
            _v = _ohms(_e.resistance)
            if _v:
                _e.resistance = _v * _k

for element in circuit.elements:
    # print("element.name", element.name)
    if element.name.lower().startswith("cf") or element.name.lower().startswith("ccf") or element.name.lower().startswith("c1"):
        c_name = element.name
circuit.element(c_name).capacitance = "3u"

simulator = circuit.simulator()

# [ADAPTADO A3] El transitorio arranca del punto de operación con la entrada
# en su valor de continua (el `dc {bias}` que el propio verificador le pone a
# la fuente), no del nivel bajo del pulso. Con la Rf de un integrador práctico,
# arrancar del nivel bajo deja la salida en Adc*0.5 V y su descarga
# (tau = Rf*Cf) se suma a la pendiente medida. Si el punto de operación no
# se puede calcular, se simula como el original.
_usar_ic = False
try:
    _op = simulator.operating_point()
    _ic = {str(_n): float(_v[0]) for _n, _v in _op.nodes.items() if str(_n).lower() not in ("0", "gnd")}
    simulator = circuit.simulator()
    simulator.initial_condition(**_ic)
    _usar_ic = True
except Exception:
    simulator = circuit.simulator()

try:
    analysis = simulator.transient(step_time=1@u_us, end_time=200@u_ms, use_initial_condition=_usar_ic)
except:
    print("analysis failed.")
    sys.exit(2)


import numpy as np
import matplotlib.pyplot as plt
# Plot the step response
time = np.array(analysis.time)
vin = np.array(analysis['vin'])
vout = np.array(analysis['vout'])


plt.figure()
plt.plot(time, vout)
plt.title('Step Response of Op-amp Integrator')
plt.xlabel('Time [s]')
plt.ylabel('Output Voltage [V]')
plt.grid(True)
plt.savefig("[FIGURE_PATH]")


expected_slope = 0.5 / 0.03


from scipy.signal import find_peaks

peaks, _ = find_peaks(vout)

troughs, _ = find_peaks(-vout)

if len(peaks) < 2 or len(troughs) < 2:
    print("No peaks or troughs found in output voltage. Please check the netlist.")
    sys.exit(2)


start = peaks[-2]
end = troughs[troughs > start][0] 

slope, intercept = np.polyfit(time[start:end], vout[start:end], 1)
slope = np.abs(slope)
from scipy.stats import linregress
_, _, r_value, p_value, std_err = linregress(time[start:end], vout[start:end])



import sys
if not np.isclose(slope, expected_slope, rtol=0.3):  # 30% tolerance
    print(f"The circuit does not function correctly as an integrator.\n"
          f"Expected slope: {expected_slope} V/s | Actual slope: {slope} V/s\n")
    sys.exit(2)

if not r_value** 2 >= 0.9:
    print("The op-amp integrator does not have a linear response.\n")
    sys.exit(2)


for element in circuit.elements:
    if element.name.lower().startswith("x"):
        x_name = element.name

circuit.element(x_name).detach()
simulator = circuit.simulator()
try:
    analysis = simulator.transient(step_time=1@u_us, end_time=200@u_ms)
except:
    print("The op-amp integrator functions correctly.\n")
    sys.exit(0)

time = np.array(analysis.time)
vin = np.array(analysis['vin'])
vout = np.array(analysis['vout'])




expected_slope = 0.5 / 0.03


from scipy.signal import find_peaks

peaks, _ = find_peaks(vout)

troughs, _ = find_peaks(-vout)

if len(peaks) < 2 or len(troughs) < 2:
    print("The op-amp integrator functions correctly.\n")
    sys.exit(0)


start = peaks[-2]
end = troughs[troughs > start][0] 

slope, intercept = np.polyfit(time[start:end], vout[start:end], 1)
slope = np.abs(slope)
from scipy.stats import linregress
_, _, r_value, p_value, std_err = linregress(time[start:end], vout[start:end])


if np.isclose(slope, expected_slope, rtol=0.5):  # 50% tolerance
    print("The integrator maybe a passive integrator.\n")
    sys.exit(2)

print("The op-amp integrator functions correctly.\n")
sys.exit(0)

