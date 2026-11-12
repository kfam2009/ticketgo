'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { db, transaccion, ajuste } = require('./db');
const mail = require('./mail');
const { firmar, verificar, cifrar, descifrar } = require('./util');

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nuevoCodigo() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += LETRAS[b[i] % LETRAS.length];
  return s;
}
const lindo = (c) => c.slice(0, 4) + '-' + c.slice(4);
const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const ahora = () => new Date().toISOString();

/** Comisión general de la plataforma: la que se cargó en el administrador o, si no, la de las variables de entorno. */
function comisionGeneral() {
  const pct = ajuste('comision_pct');
  const fija = ajuste('comision_fija');
  return { pct: pct != null && pct !== '' ? Number(pct) : config.comisionPct, fija: fija != null && fija !== '' ? Number(fija) : config.comisionFija };
}

/** Comisión que se aplica a una productora (la suya propia o la general). */
function comisionPara(productora) {
  const g = comisionGeneral();
  return {
    pct: productora && productora.comision_pct != null ? Number(productora.comision_pct) : g.pct,
    fija: productora && productora.comision_fija != null ? Number(productora.comision_fija) : g.fija,
  };
}

function comisionDe(productora, monto, cantidad) {
  const { pct, fija } = comisionPara(productora);
  return Math.round((monto * pct / 100 + fija * cantidad) * 100) / 100;
}

function vendidas(eventoId) {
  const r = db.prepare("SELECT COALESCE(SUM(cantidad), 0) AS n FROM ordenes WHERE evento_id = ? AND estado IN ('aprobado', 'procesando', 'prueba')").get(eventoId);
  return Number(r.n);
}

function crearAccesos(orden) {
  const ins = db.prepare('INSERT OR IGNORE INTO accesos (evento_id, orden_id, codigo, creado) VALUES (?, ?, ?, ?)');
  let hechos = 0;
  for (let i = 0; i < orden.cantidad * 5 && hechos < orden.cantidad; i++) {
    if (ins.run(orden.evento_id, orden.id, nuevoCodigo(), ahora()).changes) hechos++;
  }
}

function accesosDe(ordenId, base) {
  return db.prepare('SELECT codigo, revocado FROM accesos WHERE orden_id = ? ORDER BY id').all(ordenId)
    .map((a) => ({ codigo: lindo(a.codigo), url: `${base}/v/${lindo(a.codigo)}`, revocado: !!a.revocado }));
}

async function enviarAccesos(ordenId, base) {
  const o = db.prepare(`SELECT o.*, e.titulo, e.fecha, p.nombre AS productora FROM ordenes o
      JOIN eventos e ON e.id = o.evento_id JOIN productoras p ON p.id = o.productora_id WHERE o.id = ?`).get(ordenId);
  if (!o || !['aprobado', 'prueba'].includes(o.estado)) return false;
  const fecha = o.fecha ? new Date(o.fecha).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' hs' : '';
  const ok = await mail.accesos({ para: o.email, nombre: o.nombre, productora: o.productora, evento: o.titulo, fecha, links: accesosDe(o.id, base).filter((l) => !l.revocado) });
  if (ok) db.prepare('UPDATE ordenes SET email_enviado = 1 WHERE id = ?').run(o.id);
  return ok;
}

/* ---------------- Mercado Pago ---------------- */

async function mp(method, ruta, body, token = config.mp.token) {
  const r = await fetch(config.mp.apiBase + ruta, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = `Mercado Pago respondió ${r.status}${j && j.message ? ': ' + j.message : ''}`;
    console.error('[mp]', method, ruta, msg);
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return j;
}

/* ----- Cuenta de Mercado Pago de cada productora (OAuth + split de pagos) ----- */

const redirectMP = (base) => `${config.baseUrl || base}/panel/mercadopago/vuelta`;
const mpConectada = (p) => Boolean(p && p.mp_token && config.mpOauthListo());

function urlConexionMP(p, base) {
  const state = firmar({ mp: p.id, e: Math.floor(Date.now() / 1000) + 3600 });
  const q = new URLSearchParams({ client_id: config.mp.clientId, response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectMP(base) });
  return `${config.mp.authBase}/authorization?${q}`;
}

async function pedirTokenMP(datos) {
  const r = await fetch(config.mp.apiBase + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: config.mp.clientId, client_secret: config.mp.clientSecret, ...datos }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) {
    const msg = `Mercado Pago respondió ${r.status}${j && (j.message || j.error) ? ': ' + (j.message || j.error) : ''}`;
    console.error('[mp oauth]', msg);
    throw new Error(msg);
  }
  return j;
}

function guardarTokensMP(productoraId, j) {
  db.prepare('UPDATE productoras SET mp_user_id = ?, mp_token = ?, mp_refresh = ?, mp_vence = ?, mp_conectado = COALESCE(mp_conectado, ?) WHERE id = ?').run(
    String(j.user_id || ''), cifrar(j.access_token), j.refresh_token ? cifrar(j.refresh_token) : null,
    Date.now() + (Number(j.expires_in) || 15552000) * 1000, ahora(), productoraId);
}

/** Vuelta del OAuth: verifica el state y guarda los tokens de la productora. */
async function conectarMP(p, code, state, base) {
  const st = verificar(state);
  if (!st || st.vencido || st.mp !== p.id) throw new Error('El pedido de conexión venció o no es de esta productora. Probá de nuevo.');
  const j = await pedirTokenMP({ grant_type: 'authorization_code', code, redirect_uri: redirectMP(base) });
  db.prepare('UPDATE productoras SET mp_conectado = NULL WHERE id = ?').run(p.id);
  guardarTokensMP(p.id, j);
  return j;
}

function desconectarMP(productoraId) {
  db.prepare('UPDATE productoras SET mp_user_id = NULL, mp_token = NULL, mp_refresh = NULL, mp_vence = NULL, mp_conectado = NULL WHERE id = ?').run(productoraId);
}

/** Token vigente de la productora (lo renueva si vence en menos de 15 días). */
async function tokenProductora(p) {
  if (!mpConectada(p)) return null;
  if (p.mp_refresh && Number(p.mp_vence) < Date.now() + 15 * 864e5) {
    try {
      const j = await pedirTokenMP({ grant_type: 'refresh_token', refresh_token: descifrar(p.mp_refresh) });
      guardarTokensMP(p.id, j);
      return j.access_token;
    } catch (e) {
      console.error('[mp] no se pudo renovar el token de la productora', p.id, e.message);
    }
  }
  return descifrar(p.mp_token);
}

/** Token con el que se consulta un pago: el de la productora si la orden se cobró en su cuenta. */
async function tokenDeOrden(o) {
  if (o && o.mp_split) {
    const p = db.prepare('SELECT * FROM productoras WHERE id = ?').get(o.productora_id);
    const t = await tokenProductora(p);
    if (t) return t;
  }
  return config.mp.token;
}

/** Se puede cobrar con Mercado Pago: con la cuenta de la productora o, si no conectó, con la de la plataforma. */
const puedeCobrarMP = (p) => mpConectada(p) || config.mpListo();

async function crearCobro(orden, evento, productora, base) {
  const pref = {
    items: [{ id: 'evento-' + evento.id, title: `${evento.titulo} — ${productora.nombre}`.slice(0, 250), quantity: orden.cantidad, unit_price: Math.round(Number(orden.monto) / orden.cantidad * 100) / 100, currency_id: 'ARS' }],
    external_reference: 'orden-' + orden.id,
    notification_url: `${base}/pagos/mp?o=${orden.id}`,
    back_urls: { success: `${base}/compra/${orden.token}`, failure: `${base}/compra/${orden.token}`, pending: `${base}/compra/${orden.token}` },
    auto_return: 'approved',
    statement_descriptor: config.marca.toUpperCase().slice(0, 22),
  };
  const tp = await tokenProductora(productora);
  if (tp) {
    // La venta entra a la cuenta de la productora y Mercado Pago le pasa la comisión a la plataforma
    const fee = Math.min(Math.max(0, Number(orden.comision) || 0), Number(orden.monto) - 0.01);
    try {
      const r = await mp('POST', '/checkout/preferences', { ...pref, marketplace_fee: Math.round(fee * 100) / 100 }, tp);
      db.prepare('UPDATE ordenes SET mp_split = 1 WHERE id = ?').run(orden.id);
      return { id: r.id, url: r.init_point };
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) throw e;
      console.error('[mp] la cuenta de la productora', productora.id, 'no autoriza: se cobra con la plataforma');
      if (!config.mpListo()) throw e;
    }
  }
  const r = await mp('POST', '/checkout/preferences', pref);
  return { id: r.id, url: r.init_point };
}

/** Aplica el estado de un pago de Mercado Pago a su orden. Idempotente. */
async function aplicarPago(pago, base) {
  const m = /^orden-(\d+)$/.exec(String(pago.external_reference || ''));
  if (!m) return null;
  const id = Number(m[1]);
  const o = db.prepare('SELECT * FROM ordenes WHERE id = ?').get(id);
  if (!o) return null;
  const st = pago.status;
  if (st === 'approved') {
    if (Math.abs(Number(pago.transaction_amount) - Number(o.monto)) > 0.01) {
      console.error('[mp] monto distinto en orden', id, pago.transaction_amount, o.monto);
      return o;
    }
    const tomada = db.prepare("UPDATE ordenes SET estado = 'procesando', modificado = ? WHERE id = ? AND estado IN ('pendiente', 'rechazado')").run(ahora(), id);
    if (tomada.changes) {
      transaccion(() => {
        crearAccesos(o);
        db.prepare("UPDATE ordenes SET estado = 'aprobado', mp_payment_id = ?, modificado = ? WHERE id = ?").run(String(pago.id), ahora(), id);
      });
      await enviarAccesos(id, base);
    }
  } else if (st === 'refunded' || st === 'charged_back') {
    transaccion(() => {
      db.prepare("UPDATE ordenes SET estado = 'devuelto', modificado = ? WHERE id = ?").run(ahora(), id);
      db.prepare('UPDATE accesos SET revocado = 1, sesion = NULL WHERE orden_id = ?').run(id);
    });
  } else if (st === 'rejected' || st === 'cancelled') {
    db.prepare("UPDATE ordenes SET estado = 'rechazado', modificado = ? WHERE id = ? AND estado = 'pendiente'").run(ahora(), id);
  }
  return db.prepare('SELECT * FROM ordenes WHERE id = ?').get(id);
}

/** Consulta un pago. Si se conoce la orden, usa el token de la cuenta donde se cobró. */
async function procesarPago(paymentId, base, ordenId = null) {
  const o = ordenId ? db.prepare('SELECT * FROM ordenes WHERE id = ?').get(Number(ordenId)) : null;
  const ruta = `/v1/payments/${encodeURIComponent(paymentId)}`;
  if (o && o.mp_split) return aplicarPago(await mp('GET', ruta, null, await tokenDeOrden(o)), base);
  try {
    return aplicarPago(await mp('GET', ruta), base);
  } catch (e) {
    if (!o) throw e;
    return aplicarPago(await mp('GET', ruta, null, await tokenDeOrden({ ...o, mp_split: 1 })), base);
  }
}

async function revisarOrden(ordenId, base) {
  const o = db.prepare('SELECT * FROM ordenes WHERE id = ?').get(ordenId);
  const r = await mp('GET', `/v1/payments/search?external_reference=orden-${ordenId}&sort=date_created&criteria=desc&limit=5`, null, await tokenDeOrden(o));
  let ultimo = null;
  for (const p of (r && r.results) || []) {
    ultimo = await aplicarPago(p, base);
    if (ultimo && ultimo.estado === 'aprobado') break;
  }
  return ultimo;
}

/** Compra de prueba (productora en modo test): sin pago, marcada como prueba. */
async function compraDePrueba(orden, base) {
  transaccion(() => {
    crearAccesos(orden);
    db.prepare("UPDATE ordenes SET estado = 'prueba', modificado = ? WHERE id = ?").run(ahora(), orden.id);
  });
  await enviarAccesos(orden.id, base);
}

module.exports = { comisionGeneral, comisionPara, mpConectada, puedeCobrarMP, urlConexionMP, conectarMP, desconectarMP, nuevoCodigo, lindo, normalizarCodigo, comisionDe, vendidas, accesosDe, enviarAccesos, crearCobro, procesarPago, revisarOrden, compraDePrueba };
