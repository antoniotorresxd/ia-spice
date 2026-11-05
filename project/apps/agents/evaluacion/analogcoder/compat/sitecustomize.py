"""Compatibilidad PySpice 1.5 con ngspice >= 41, solo para el calificador.

ngspice 41+ escribe por stderr líneas informativas ("Using SPARSE 1.3 as
Direct Linear Solver", "Note: No compatibility mode selected!") que PySpice
1.5 interpreta como error y aborta la simulación. Este módulo las reclasifica
como salida normal. No modifica circuitos ni verificadores de AnalogCoder.
"""
try:
    from PySpice.Spice.NgSpice import Shared as _S

    _INFORMATIVAS = ("Using SPARSE", "Using KLU", "Note:")
    _original = _S.NgSpiceShared._send_char

    def _send_char(message_c, ngspice_id, user_data):
        mensaje = _S.ffi_string_utf8(message_c)
        prefijo, _, contenido = mensaje.partition(" ")
        if prefijo == "stderr" and contenido.strip().startswith(_INFORMATIVAS):
            obj = _S.ffi.from_handle(user_data)
            obj._stdout.append(contenido)
            return obj.send_char(mensaje, ngspice_id)
        return _original(message_c, ngspice_id, user_data)

    _S.NgSpiceShared._send_char = staticmethod(_send_char)
except Exception:  # sin PySpice no hay nada que parchear
    pass
