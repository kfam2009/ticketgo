'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { db, transaccion } = require('./db');
const mail = require('./mail');

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

function comisionDe(productora, monto, cantidad) {
  const pct = productora.comision_pct != null ? Number(productora.comision_pct) : config.comisionPct;
  const fija = productora.comision_fija != null ? Number(productora.comision_fija) : config.comisionFija;
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

async function mp(method, ruta, body) {
  const r = await fetch(config.mp.apiBase + ruta, {
    method,
    headers: { Authorization: 'Bearer ' + config.mp.token, 'Content-Type': 'application/json' },
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

async function crearCobro(orden, evento, productora, base) {
  const pref = await mp('POST', '/checkout/preferences', {
    items: [{ id: 'evento-' + evento.id, title: `${evento.titulo} — ${productora.nombre}`.slice(0, 250), quantity: orden.cantidad, unit_price: Number(evento.precio), currency_id: 'ARS' }],
    external_reference: 'orden-' + orden.id,
    notification_url: `${base}/pagos/mp`,
    back_urls: { success: `${base}/compra/${orden.token}`, failure: `${base}/compra/${orden.token}`, pending: `${base}/compra/${orden.token}` },
    auto_return: 'approved',
    statement_descriptor: config.marca.toUpperCase().slice(0, 22),
  });
  return { id: pref.id, url: pref.init_point };
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

async function procesarPago(paymentId, base) {
  return aplicarPago(await mp('GET', `/v1/payments/${encodeURIComponent(paymentId)}`), base);
}

async function revisarOrden(ordenId, base) {
  const r = await mp('GET', `/v1/payments/search?external_reference=orden-${ordenId}&sort=date_created&criteria=desc&limit=5`);
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

module.exports = { nuevoCodigo, lindo, normalizarCodigo, comisionDe, vendidas, accesosDe, enviarAccesos, crearCobro, procesarPago, revisarOrden, compraDePrueba };
