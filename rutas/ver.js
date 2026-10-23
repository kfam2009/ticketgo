'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('../lib/config');
const { db } = require('../lib/db');
const { verificar } = require('../lib/util');
const { enviar, json, leerCuerpo } = require('../lib/http');
const { reproductor, mensaje } = require('../lib/reproductor');
const cf = require('../lib/cloudflare');
const { estadoEvento } = require('../lib/estado');

const LIBERA = 60 * 1000; // sin latidos durante 1 minuto, la pantalla se da por cerrada
const hlsLocal = path.join(__dirname, '..', 'public', 'hls.min.js');

function leerTicket(t) {
  const d = verificar(t);
  if (!d || typeof d.a !== 'number') return { error: 'Link inválido', detalle: 'Volvé a abrir el link de tu entrada.' };
  if (d.vencido) return { error: 'Este link venció', detalle: 'Volvé a abrir el link de tu entrada (el que te llegó por mail).' };
  const a = db.prepare('SELECT * FROM accesos WHERE id = ?').get(d.a);
  if (!a) return { error: 'Link inválido', detalle: '' };
  if (a.revocado) return { error: 'Esta entrada fue anulada', detalle: '' };
  return { acceso: a };
}

function eventoDe(a) {
  const ev = db.prepare(`SELECT e.*, p.nombre AS p_nombre, p.slug AS p_slug, p.id AS p_id, p.estado AS p_estado,
      (p.logo IS NOT NULL AND p.logo <> '') AS p_logo, length(p.logo) AS p_logo_v
      FROM eventos e JOIN productoras p ON p.id = e.productora_id WHERE e.id = ?`).get(a.evento_id);
  if (ev) ev.activo = ev.p_estado === 'suspendida' ? 0 : 1;
  return ev;
}

async function fuentes(ev, est) {
  if (est.estado === 'vivo') return [{ id: ev.cf_uid, url: await cf.urlHls(ev.cf_uid, 6) }];
  if (est.estado === 'repeticion') return Promise.all(est.partes.map(async (p) => ({ id: p.uid, url: await cf.urlHls(p.uid, 6) })));
  return [];
}

async function ver(req, res, t, accion) {
  const tk = leerTicket(t);
  if (!accion) {
    if (tk.error) return enviar(res, 403, mensaje(tk.error, tk.detalle));
    const ev = eventoDe(tk.acceso);
    if (!ev) return enviar(res, 404, mensaje('Evento inexistente', ''));
    const marca = { nombre: ev.p_nombre, sitio: '/' + ev.p_slug, logo: ev.p_logo ? `/logo/${ev.p_id}?v=${ev.p_logo_v}` : '' };
    const hlsUrl = fs.existsSync(hlsLocal) ? '/js/r.js' : config.hlsCdn;
    return enviar(res, 200, reproductor({ token: t, hlsUrl, titulo: ev.titulo, marca }), 'text/html; charset=utf-8', { 'Referrer-Policy': 'no-referrer' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  if (tk.error) return json(res, 200, tk);
  const body = await leerCuerpo(req, 4096);
  const s = String(body.s || '').slice(0, 64);
  if (!s) return json(res, 400, { error: 'Sesión inválida' });
  const a = tk.acceso;
  const ahoraMs = Date.now();
  const iso = new Date().toISOString();
  const deCompra = a.orden_id != null; // los accesos de prueba del panel no tienen bloqueo de pantalla
  if (accion === 'salir') {
    if (a.sesion === s) db.prepare('UPDATE accesos SET sesion_latido = 0 WHERE id = ?').run(a.id);
    return json(res, 200, { ok: true });
  }
  if (accion === 'iniciar') {
    const otraActiva = a.sesion && a.sesion !== s && Number(a.sesion_latido) > ahoraMs - LIBERA;
    if (otraActiva && deCompra) return json(res, 200, { ocupado: true });
    db.prepare(`UPDATE accesos SET sesion = ?, sesion_latido = ?, aperturas = aperturas + 1,
        primera_vista = COALESCE(primera_vista, ?), ultima_vista = ? WHERE id = ?`).run(s, ahoraMs, iso, iso, a.id);
  } else if (accion === 'latido') {
    if (a.sesion && a.sesion !== s && deCompra) return json(res, 200, { expulsado: true });
    db.prepare('UPDATE accesos SET sesion = ?, sesion_latido = ?, ultima_vista = ? WHERE id = ?').run(s, ahoraMs, iso, a.id);
  } else {
    return json(res, 404, { error: 'Ruta inexistente' });
  }
  const ev = eventoDe(a);
  if (!ev) return json(res, 200, { error: 'Evento inexistente' });
  const est = await estadoEvento(ev);
  const necesitaFuentes = accion === 'iniciar' || body.estado !== est.estado;
  let lista = [];
  try {
    lista = necesitaFuentes ? await fuentes(ev, est) : [];
  } catch (e) {
    console.error('[ver]', e.message);
    return json(res, 200, { estado: 'error' });
  }
  return json(res, 200, { estado: est.estado, titulo: ev.titulo, fuentes: necesitaFuentes ? lista : undefined });
}

async function manejar(req, res, url, partes) {
  if (partes[0] === 'ver' && partes[1]) return await ver(req, res, partes[1], partes[2]), true;
  if (partes[0] === 'js' && partes[1] === 'r.js') {
    if (!fs.existsSync(hlsLocal)) { res.writeHead(302, { Location: config.hlsCdn }); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(hlsLocal).pipe(res);
    return true;
  }
  return false;
}

module.exports = { manejar };
