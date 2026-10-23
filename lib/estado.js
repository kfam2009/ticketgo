'use strict';
const cf = require('./cloudflare');

// Cache corto por evento: 150 espectadores consultando cada 20 s no deben pegarle a la API de Cloudflare.
const cache = new Map();
const TTL = 15000;

async function calcular(ev) {
  if (!ev.activo) return { estado: 'cerrado', partes: [] };
  if (!ev.cf_uid) return { estado: 'espera', partes: [] };
  const [conexion, grabs] = await Promise.all([cf.estadoEntrada(ev.cf_uid), cf.grabaciones(ev.cf_uid).catch(() => [])]);
  if (conexion === 'connected') return { estado: 'vivo', partes: [] };
  const listas = grabs.filter((g) => g.estado === 'ready').sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
  if (ev.grabar && listas.length) {
    const ult = listas[listas.length - 1];
    const fin = new Date(ult.creado).getTime() + (ult.duracion || 0) * 1000;
    const horas = Number(ev.repeticion_horas || 0);
    if (horas === 0 || Date.now() < fin + horas * 3600 * 1000) {
      return { estado: 'repeticion', partes: listas.map((g) => ({ uid: g.uid, duracion: g.duracion })) };
    }
    return { estado: 'terminado', partes: [] };
  }
  if (grabs.some((g) => g.estado && g.estado !== 'ready' && g.estado !== 'error')) return { estado: 'procesando', partes: [] };
  if (listas.length) return { estado: 'terminado', partes: [] };
  return { estado: 'espera', partes: [] };
}

async function estadoEvento(ev) {
  const k = ev.id;
  const c = cache.get(k);
  if (c && Date.now() - c.t < TTL && c.activo === ev.activo) return c.d;
  if (c && c.pendiente) return c.pendiente;
  const pendiente = calcular(ev)
    .then((d) => { cache.set(k, { t: Date.now(), d, activo: ev.activo }); return d; })
    .catch((e) => {
      const viejo = c && c.d;
      cache.set(k, { t: Date.now() - TTL + 5000, d: viejo || { estado: 'error', partes: [], error: e.message }, activo: ev.activo });
      return viejo || { estado: 'error', partes: [], error: e.message };
    });
  cache.set(k, { ...(c || {}), pendiente });
  return pendiente;
}

const olvidar = (id) => cache.delete(id);

const TEXTOS = {
  vivo: 'En vivo',
  repeticion: 'Repetición disponible',
  procesando: 'Preparando repetición',
  espera: 'Esperando señal',
  terminado: 'Finalizado',
  cerrado: 'Desactivado',
  error: 'Sin datos',
};

module.exports = { estadoEvento, olvidar, TEXTOS };
