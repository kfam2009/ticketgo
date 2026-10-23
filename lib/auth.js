'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { db } = require('./db');
const { firmar, verificar } = require('./util');
const { cookies, baseUrl } = require('./http');

function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(clave), sal, 32);
  return 'scrypt:' + sal.toString('hex') + ':' + h.toString('hex');
}

function claveOk(clave, guardada) {
  const [tipo, sal, h] = String(guardada || '').split(':');
  if (tipo !== 'scrypt' || !sal || !h) return false;
  const calc = crypto.scryptSync(String(clave), Buffer.from(sal, 'hex'), 32);
  const esp = Buffer.from(h, 'hex');
  return esp.length === calc.length && crypto.timingSafeEqual(esp, calc);
}

const DURACION = 7 * 24 * 3600; // una semana

function iniciarSesion(req, res, usuario, extra = {}) {
  const t = firmar({ u: usuario.id, e: Math.floor(Date.now() / 1000) + DURACION, ...extra });
  db.prepare('UPDATE usuarios SET ultimo_ingreso = ? WHERE id = ?').run(new Date().toISOString(), usuario.id);
  const seguro = baseUrl(req).startsWith('https://') ? '; Secure' : '';
  return `tg=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACION}${seguro}`;
}

const cerrarSesion = () => 'tg=; Path=/; Max-Age=0';

/** Usuario logueado (con su productora), o null. Si un admin "entra como" una productora, se respeta. */
function usuarioActual(req) {
  if (req._usuario !== undefined) return req._usuario;
  const t = verificar(cookies(req).tg);
  let u = null;
  if (t && !t.vencido && t.u) {
    u = db.prepare('SELECT id, email, nombre, rol, productora_id FROM usuarios WHERE id = ?').get(t.u) || null;
    if (u && u.rol === 'admin' && t.como) u = { ...u, productora_id: t.como, comoAdmin: true };
  }
  req._usuario = u;
  return u;
}

/** Crea o actualiza el admin desde las variables ADMIN_EMAIL / ADMIN_PASSWORD. */
function asegurarAdmin() {
  if (!config.adminEmail || !config.adminPassword) {
    console.warn('[aviso] Falta ADMIN_EMAIL o ADMIN_PASSWORD: no hay administrador.');
    return;
  }
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(config.adminEmail);
  if (!u) {
    db.prepare("INSERT INTO usuarios (email, nombre, clave, rol, creado) VALUES (?, 'Administrador', ?, 'admin', ?)")
      .run(config.adminEmail, hashClave(config.adminPassword), new Date().toISOString());
  } else if (u.rol !== 'admin' || !claveOk(config.adminPassword, u.clave)) {
    db.prepare("UPDATE usuarios SET rol = 'admin', productora_id = NULL, clave = ? WHERE id = ?").run(hashClave(config.adminPassword), u.id);
  }
}

module.exports = { hashClave, claveOk, iniciarSesion, cerrarSesion, usuarioActual, asegurarAdmin };
