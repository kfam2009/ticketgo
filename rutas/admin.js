'use strict';
const config = require('../lib/config');
const { db } = require('../lib/db');
const { esc } = require('../lib/util');
const { enviar, redirigir, leerCuerpo, baseUrl } = require('../lib/http');
const { panel } = require('../lib/vistas');
const auth = require('../lib/auth');
const D = require('../lib/datos');

const ESTADOS = { test: ['Modo test', 'amarillo'], activa: ['Activa', 'verde'], suspendida: ['Suspendida', 'rojo'] };

async function inicio(req, res, u, url) {
  let aviso = '';
  if (req.method === 'POST') {
    const b = await leerCuerpo(req);
    const p = D.productora(Number(b.id));
    if (p && b.accion === 'estado' && ESTADOS[b.estado]) {
      db.prepare('UPDATE productoras SET estado = ? WHERE id = ?').run(b.estado, p.id);
      aviso = `<div class="ok">${esc(p.nombre)}: ${ESTADOS[b.estado][0]}.</div>`;
    }
    if (p && b.accion === 'comision') {
      const pct = b.pct === '' ? null : Math.max(0, Math.min(50, Number(b.pct)));
      const fija = b.fija === '' ? null : Math.max(0, Number(b.fija));
      db.prepare('UPDATE productoras SET comision_pct = ?, comision_fija = ? WHERE id = ?').run(Number.isFinite(pct) ? pct : null, Number.isFinite(fija) ? fija : null, p.id);
      aviso = `<div class="ok">Comisión de ${esc(p.nombre)} actualizada (aplica a las ventas nuevas).</div>`;
    }
    if (p && b.accion === 'clave') {
      const nueva = String(b.clave || '');
      if (nueva.length < 8) aviso = '<div class="error">La clave tiene que tener al menos 8 caracteres.</div>';
      else {
        db.prepare("UPDATE usuarios SET clave = ? WHERE productora_id = ? AND rol = 'productora'").run(auth.hashClave(nueva), p.id);
        aviso = `<div class="ok">Clave de ${esc(p.nombre)} cambiada. Pasásela por privado.</div>`;
      }
    }
  }
  const ps = db.prepare(`SELECT p.*, (SELECT email FROM usuarios WHERE productora_id = p.id ORDER BY id LIMIT 1) AS email,
      (SELECT COUNT(*) FROM eventos WHERE productora_id = p.id) AS eventos,
      COALESCE((SELECT SUM(cantidad) FROM ordenes WHERE productora_id = p.id AND estado = 'aprobado'), 0) AS entradas,
      COALESCE((SELECT SUM(monto) FROM ordenes WHERE productora_id = p.id AND estado = 'aprobado'), 0) AS bruto,
      COALESCE((SELECT SUM(comision) FROM ordenes WHERE productora_id = p.id AND estado = 'aprobado'), 0) AS comision
    FROM productoras p ORDER BY p.creado DESC`).all();
  const tot = ps.reduce((t, p) => ({ bruto: t.bruto + p.bruto, comision: t.comision + p.comision, entradas: t.entradas + p.entradas }), { bruto: 0, comision: 0, entradas: 0 });
  const filas = ps.map((p) => `<tr>
    <td><b>${esc(p.nombre)}</b> <span class="pill ${ESTADOS[p.estado][1]}">${ESTADOS[p.estado][0]}</span><br><a href="/${esc(p.slug)}" target="_blank">/${esc(p.slug)}</a><br><small>${esc(p.email || '')}${p.whatsapp ? ' · ' + esc(p.whatsapp) : ''}</small><br><small>Alta ${D.fechaLinda(p.creado, true)}</small></td>
    <td>${p.eventos}</td><td>${p.entradas}</td><td>${D.plata(p.bruto)}</td><td><b>${D.plata(p.comision)}</b></td>
    <td><details><summary class="btn sec chico">Gestionar</summary><div style="min-width:260px;margin-top:10px">
      <form method="post" class="fila"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="accion" value="estado">
        ${Object.entries(ESTADOS).filter(([k]) => k !== p.estado).map(([k, t]) => `<button class="btn ${k === 'activa' ? 'verde' : k === 'suspendida' ? 'peligro' : 'sec'} chico" name="estado" value="${k}">${k === 'activa' ? 'Activar' : k === 'test' ? 'Pasar a test' : 'Suspender'}</button>`).join('')}</form>
      <form method="post" style="margin-top:10px"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="accion" value="comision">
        <div class="dos"><div><label>Comisión %</label><input name="pct" type="number" step="0.1" min="0" max="50" value="${p.comision_pct != null ? p.comision_pct : ''}" placeholder="${config.comisionPct}"></div>
        <div><label>Fijo por entrada $</label><input name="fija" type="number" step="1" min="0" value="${p.comision_fija != null ? p.comision_fija : ''}" placeholder="${config.comisionFija}"></div></div>
        <small>Vacío = la general (${config.comisionPct}% + $${config.comisionFija}).</small><br><button class="btn sec chico" style="margin-top:6px">Guardar comisión</button></form>
      <form method="post" style="margin-top:10px"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="accion" value="clave">
        <label>Nueva clave para la productora</label><div class="fila"><input name="clave" minlength="8" style="flex:1"><button class="btn sec chico">Cambiar</button></div></form>
      <a class="btn chico" style="margin-top:10px" href="/admin/como/${p.id}">Entrar a su panel</a>
    </div></details></td></tr>`).join('');
  const cuerpo = `<h1>Productoras</h1><p class="sub">Activá las nuevas, ajustá comisiones y entrá a sus paneles para ayudarlas.</p>${aviso}
    ${!config.mpListo() ? '<div class="aviso">Falta MP_ACCESS_TOKEN: las productoras activas todavía no pueden cobrar.</div>' : ''}
    ${!config.cloudflareListo() ? '<div class="aviso">Falta configurar Cloudflare (CF_ACCOUNT_ID / CF_API_TOKEN): los eventos se crean sin señal.</div>' : ''}
    ${!config.mailListo() ? '<div class="aviso">Falta configurar Brevo (BREVO_API_KEY / MAIL_FROM): no salen los mails.</div>' : ''}
    <div class="kpis"><div class="kpi c"><b>${ps.length}</b><span>Productoras</span></div><div class="kpi g"><b>${tot.entradas}</b><span>Entradas vendidas</span></div>
      <div class="kpi w"><b>${D.plata(tot.bruto)}</b><span>Ventas totales</span></div><div class="kpi r"><b>${D.plata(tot.comision)}</b><span>Tu comisión</span></div></div>
    <div class="card tabla">${ps.length ? `<table><thead><tr><th>Productora</th><th>Eventos</th><th>Entradas</th><th>Ventas</th><th>Comisión</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
      : `<p class="muted" style="margin:0">Todavía no hay productoras. Se registran en <a href="/registro">${esc(baseUrl(req))}/registro</a>.</p>`}</div>`;
  enviar(res, 200, panel({ titulo: 'Productoras', cuerpo, usuario: u, productora: null, activo: 'admin' }));
}

async function manejar(req, res, url, partes) {
  if (partes[0] !== 'admin') return false;
  const u = auth.usuarioActual(req);
  if (!u) return redirigir(res, '/ingresar'), true;
  if (u.rol !== 'admin') return redirigir(res, '/panel'), true;
  if (partes[1] === 'como' && /^\d+$/.test(partes[2] || '') && D.productora(Number(partes[2]))) {
    return redirigir(res, '/panel', { 'Set-Cookie': auth.iniciarSesion(req, res, u, { como: Number(partes[2]) }) }), true;
  }
  if (partes[1] === 'salir-de') return redirigir(res, '/admin', { 'Set-Cookie': auth.iniciarSesion(req, res, u) }), true;
  if (u.comoAdmin) return redirigir(res, '/admin/salir-de'), true;
  return await inicio(req, res, u, url), true;
}

module.exports = { manejar };
