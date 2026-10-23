'use strict';
const config = require('./config');

function enviar(res, codigo, cuerpo, tipo = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(codigo, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(cuerpo);
}
const json = (res, codigo, obj, extra = {}) => enviar(res, codigo, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
const redirigir = (res, a, extra = {}) => { res.writeHead(303, { Location: a, 'Cache-Control': 'no-store', ...extra }); res.end(); };

function leerCuerpo(req, limite = 64 * 1024) {
  if (req._cuerpo) return Promise.resolve(req._cuerpo);
  return new Promise((ok, mal) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > limite) { mal(Object.assign(new Error('El envío es demasiado grande'), { status: 413 })); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      const txt = Buffer.concat(partes).toString('utf8');
      const tipo = String(req.headers['content-type'] || '');
      let r = {};
      if (txt) {
        if (tipo.includes('application/json')) { try { r = JSON.parse(txt) || {}; } catch { r = {}; } }
        else r = Object.fromEntries(new URLSearchParams(txt));
      }
      req._cuerpo = r;
      ok(r);
    });
    req.on('error', mal);
  });
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function baseUrl(req) {
  if (config.baseUrl) return config.baseUrl;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host}`;
}

const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

/** Límite simple de intentos en memoria: max usos por ventana (ms). */
const usos = new Map();
function limite(clave, max, ventana) {
  const ahora = Date.now();
  const r = (usos.get(clave) || []).filter((t) => ahora - t < ventana);
  if (r.length >= max) { usos.set(clave, r); return false; }
  r.push(ahora);
  usos.set(clave, r);
  return true;
}

module.exports = { enviar, json, redirigir, leerCuerpo, cookies, baseUrl, ipDe, limite };
