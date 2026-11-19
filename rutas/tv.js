'use strict';
/**
 * App de TV (Android TV / Google TV / Fire TV): emparejamiento.
 *
 * 1. La TV pide un número de 4 cifras (POST /tv/api/nuevo) y lo muestra con un QR a /tv?c=NNNN.
 * 2. Desde el celular, con la entrada abierta (botón "App de TV") o en /tv con el código de la entrada,
 *    se vincula ese número (POST /tv/api/vincular).
 * 3. La TV consulta (GET /tv/api/estado) y recibe un link firmado para usar la misma API del reproductor web
 *    (/ver/<t>/iniciar y /latido). La TV queda con la pantalla: si era una compra, el celular se corta.
 * También se puede escribir el código de la entrada con el control remoto (POST /tv/api/codigo).
 */
const crypto = require('node:crypto');
const { db } = require('../lib/db');
const { firmar, verificar, esc } = require('../lib/util');
const { enviar, json, redirigir, leerCuerpo, ipDe, limite } = require('../lib/http');
const { suelta } = require('../lib/vistas');
const { normalizarCodigo } = require('../lib/ventas');

const APK = 'https://github.com/kfam2009/ticketgo/releases/download/tv-latest/TicketGo-TV.apk';
const VIGENCIA_PAR = 15 * 60e3; // el número de la TV dura 15 minutos
const DIAS_TV = 30; // la TV queda vinculada 30 días (o hasta que la entrada se anule)
const pares = new Map(); // número -> { id, s, creado, t }

function limpiar() {
  const ahora = Date.now();
  for (const [k, v] of pares) if (ahora - v.creado > VIGENCIA_PAR) pares.delete(k);
}

function nuevoNumero() {
  for (let i = 0; i < 50; i++) {
    const n = String(crypto.randomInt(1000, 10000));
    if (!pares.has(n)) return n;
  }
  return null;
}

/** Deja la entrada en la TV: le pasa la pantalla a la sesión de la TV y le arma un link de 30 días. */
function entregar(par, a) {
  db.prepare('UPDATE accesos SET sesion = ?, sesion_latido = ? WHERE id = ?').run(par.s, Date.now(), a.id);
  par.t = firmar({ a: a.id, e: Math.floor(Date.now() / 1000) + DIAS_TV * 86400 });
  const ev = db.prepare('SELECT titulo FROM eventos WHERE id = ?').get(a.evento_id);
  par.titulo = ev ? ev.titulo : '';
}

function accesoDeLink(t) {
  const d = verificar(String(t || ''));
  if (!d || typeof d.a !== 'number' || d.vencido) return null;
  return db.prepare('SELECT * FROM accesos WHERE id = ? AND revocado = 0').get(d.a) || null;
}

function pagina(numero = '', error = '', ok = '') {
  const cuerpo = `<div class="card" style="max-width:460px;margin:0 auto">
    <h1 style="margin-top:0">Ver en la TV</h1>
    ${ok ? `<div class="okmsg">${esc(ok)}</div><p class="muted">Ya podés cerrar esta página. En la TV, el video arranca en unos segundos.</p></div>`
    : `<p class="muted">Abrí la app <b>TicketGo</b> en tu televisor. Vas a ver un <b>número de 4 cifras</b>.</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <form method="post" action="/tv">
      <label>Número que aparece en la TV</label>
      <input name="numero" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required value="${esc(numero)}" style="font-size:28px;letter-spacing:8px;text-align:center">
      <label>Código de tu entrada</label>
      <input name="codigo" required maxlength="12" placeholder="ABCD-1234" autocapitalize="characters" style="font-size:20px;letter-spacing:3px;text-align:center">
      <p class="muted" style="font-size:13px">Está en el mail de tu entrada (por ejemplo <b>ticketgoplus.com/v/<u>ABCD-1234</u></b>). También podés abrir tu entrada en el celular y tocar <b>📺 App de TV</b>.</p>
      <button class="btn ancho" style="margin-top:10px">Ver en la TV</button>
    </form>
    <p class="muted" style="font-size:13px;margin-top:22px">¿No tenés la app? En Android TV / Google TV / Fire TV instalá <b>Downloader</b> y escribí <b>ticketgoplus.com/app</b>.</p></div>`}`;
  return suelta({ titulo: 'Ver en la TV', cuerpo });
}

async function manejar(req, res, url, partes) {
  if (partes[0] === 'app' && partes.length === 1) return redirigir(res, APK), true;
  if (partes[0] !== 'tv') return false;
  limpiar();

  // ---- API de la app
  if (partes[1] === 'api') {
    if (partes[2] === 'nuevo' && req.method === 'POST') {
      if (!limite('tvnuevo:' + ipDe(req), 30, 10 * 60e3)) return json(res, 429, { error: 'Demasiados intentos' }), true;
      const numero = nuevoNumero();
      if (!numero) return json(res, 503, { error: 'Probá de nuevo' }), true;
      const par = { id: crypto.randomBytes(16).toString('hex'), s: 'tv-' + crypto.randomBytes(12).toString('hex'), creado: Date.now(), t: null };
      pares.set(numero, par);
      return json(res, 200, { numero, id: par.id, s: par.s, vence: VIGENCIA_PAR / 1000 }), true;
    }
    if (partes[2] === 'estado' && req.method === 'GET') {
      const id = String(url.searchParams.get('id') || '');
      for (const par of pares.values()) {
        if (par.id === id) return json(res, 200, par.t ? { listo: true, t: par.t, titulo: par.titulo } : { listo: false }), true;
      }
      return json(res, 404, { vencido: true }), true;
    }
    if (partes[2] === 'vincular' && req.method === 'POST') {
      // Desde el reproductor del celular: { numero, t }
      const b = await leerCuerpo(req, 4096);
      if (!limite('tvvinc:' + ipDe(req), 20, 10 * 60e3)) return json(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' }), true;
      const par = pares.get(String(b.numero || '').replace(/\D/g, ''));
      if (!par) return json(res, 200, { error: 'Ese número no está activo. Fijate el que aparece ahora en la TV.' }), true;
      const a = accesoDeLink(b.t);
      if (!a) return json(res, 200, { error: 'Tu link venció. Volvé a abrir tu entrada desde el mail.' }), true;
      entregar(par, a);
      return json(res, 200, { ok: true }), true;
    }
    if (partes[2] === 'codigo' && req.method === 'POST') {
      // Desde la TV con el control remoto: { codigo, s }
      const b = await leerCuerpo(req, 4096);
      if (!limite('tvcod:' + ipDe(req), 15, 10 * 60e3)) return json(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' }), true;
      const a = db.prepare('SELECT * FROM accesos WHERE codigo = ? AND revocado = 0').get(normalizarCodigo(b.codigo));
      if (!a) return json(res, 200, { error: 'Código no válido. Revisalo en el mail de tu entrada.' }), true;
      const par = { s: String(b.s || '').slice(0, 64) || 'tv-' + crypto.randomBytes(12).toString('hex') };
      entregar(par, a);
      return json(res, 200, { t: par.t, s: par.s, titulo: par.titulo }), true;
    }
    return json(res, 404, { error: 'Ruta inexistente' }), true;
  }

  // ---- Página para el celular (destino del QR)
  if (partes.length === 1) {
    if (req.method === 'POST') {
      const b = await leerCuerpo(req, 4096);
      const numero = String(b.numero || '').replace(/\D/g, '');
      if (!limite('tvweb:' + ipDe(req), 20, 10 * 60e3)) return enviar(res, 429, pagina(numero, 'Demasiados intentos. Esperá unos minutos.')), true;
      const par = pares.get(numero);
      if (!par) return enviar(res, 200, pagina(numero, 'Ese número no está activo. Fijate el que aparece ahora en la TV.')), true;
      const a = db.prepare('SELECT * FROM accesos WHERE codigo = ? AND revocado = 0').get(normalizarCodigo(b.codigo));
      if (!a) return enviar(res, 200, pagina(numero, 'El código de la entrada no es válido. Revisalo en el mail.')), true;
      entregar(par, a);
      return enviar(res, 200, pagina('', '', '¡Listo! Tu entrada ya está en la TV.')), true;
    }
    return enviar(res, 200, pagina(String(url.searchParams.get('c') || '').replace(/\D/g, '').slice(0, 4))), true;
  }
  return false;
}

module.exports = { manejar };
