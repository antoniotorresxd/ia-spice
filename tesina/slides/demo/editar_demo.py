"""Arma el video de ~30 s a partir de la toma y sus marcas de tiempo.

uso: python3 editar_demo.py <carpeta_de_la_toma> [salida.mp4]

Lee <carpeta>/toma.webm y <carpeta>/marcas.json (los produce grabar_demo.mjs)
y genera un MP4 H.264 1080p con los títulos del guion. Las partes que se
aceleran (escritura y generación) lo dicen en pantalla con "acelerado ×N".
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

FONT = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
FONT_MED = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"

carpeta = Path(sys.argv[1])
salida = Path(sys.argv[2]) if len(sys.argv) > 2 else carpeta / "demo_spice.mp4"
video = carpeta / "toma.webm"
m = json.loads((carpeta / "marcas.json").read_text())
if m.get("resultado") != "completada":
    sys.exit(f"La toma no terminó bien (resultado: {m.get('resultado')}); graba otra.")

seg_gen = round(m["segundos_generacion"])

# (inicio, fin, duración objetivo o None para tiempo real, título, ¿mostrar "acelerado"?)
segmentos = [
    (m["nueva_solicitud"], m["nueva_solicitud"] + 3, None, "SPICE · de una idea a un circuito verificado", False),
    (m["escribe"], m["envia"] + 1.0, 6.0, "1 · Lo pide en lenguaje natural", True),
    (m["conversacion"], m["termina"], 8.0, "2 · Los agentes lo diseñan y lo simulan", True),
    (m["termina"] + 0.3, m["resultado_visto"], None, "3 · Verificado contra la meta", False),
    (m["esquema"], m["esquema"] + 5, None, "4 · Esquema del circuito", False),
    (m["curva"], m["curva"] + 3, None, "Simulación SPICE", False),
    (m["codigo"], m["codigo"] + 2.5, None, f"Circuito listo en {seg_gen} s", False),
]

tmp = Path(tempfile.mkdtemp())
filtros, etiquetas, total = [], [], 0.0
for i, (a, b, objetivo, titulo, marcar) in enumerate(segmentos):
    largo = b - a
    vel = max(1.0, largo / objetivo) if objetivo else 1.0
    dur = largo / vel
    total += dur
    (tmp / f"t{i}.txt").write_text(titulo, encoding="utf-8")
    cadena = (
        f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=(PTS-STARTPTS)/{vel:.4f},fps=30,"
        f"scale=1920:1080,"
        f"drawtext=fontfile={FONT}:textfile={tmp / f't{i}.txt'}:fontsize=46:fontcolor=white:"
        f"box=1:boxcolor=0x0F172A@0.86:boxborderw=24:x=64:y=h-150"
    )
    if marcar and vel > 1.05:
        (tmp / f"v{i}.txt").write_text(f"acelerado ×{vel:.0f}", encoding="utf-8")
        cadena += (
            f",drawtext=fontfile={FONT_MED}:textfile={tmp / f'v{i}.txt'}:fontsize=30:fontcolor=0x0F172A:"
            f"box=1:boxcolor=0xFDE68A@0.95:boxborderw=14:x=w-tw-70:y=60"
        )
    filtros.append(cadena + f"[v{i}]")
    etiquetas.append(f"[v{i}]")
    print(f"segmento {i + 1}: {largo:5.1f} s → {dur:4.1f} s (×{vel:.1f})  {titulo}")

fade_out = max(total - 0.6, 0)
filtros.append(f"{''.join(etiquetas)}concat=n={len(etiquetas)}:v=1:a=0,"
               f"fade=t=in:st=0:d=0.5,fade=t=out:st={fade_out:.2f}:d=0.6[out]")

subprocess.run(
    ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(video),
     "-filter_complex", ";".join(filtros), "-map", "[out]",
     "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium",
     "-movflags", "+faststart", str(salida)],
    check=True,
)
print(f"Listo: {salida} ({total:.1f} s)")
