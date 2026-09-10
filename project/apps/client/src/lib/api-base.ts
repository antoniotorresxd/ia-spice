// En dev, '/api' llega al server vía el proxy de Vite (vite dev), así que una
// base vacía basta. Ese proxy no existe en `vite preview` (lo que corre en
// producción/Railway), y ahí client y server viven en dominios distintos: sin
// esta base absoluta, el fetch relativo le pegaría al propio dominio del
// cliente en vez de al server.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
