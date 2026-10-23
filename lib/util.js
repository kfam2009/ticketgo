'use strict';
const crypto = require('node:crypto');
const config = require('./config');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const hmac = (data) => b64url(crypto.createHmac('sha256', config.secret).update(data).digest());

/** Firma un objeto chico: "payload.firma" (para links de espectador y cookie del panel). */
function firmar(obj) {
  const p = b64url(JSON.stringify(obj));
  return p + '.' + hmac(p);
}

function verificar(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [p, f] = token.split('.');
  if (!p || !f) return null;
  const esperado = hmac(p);
  if (f.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(f), Buffer.from(esperado))) return null;
  try {
    const obj = JSON.parse(unb64url(p).toString('utf8'));
    if (obj.e && obj.e < Math.floor(Date.now() / 1000)) return { ...obj, vencido: true };
    return obj;
  } catch {
    return null;
  }
}

/** Cifrado simple para guardar claves de transmisión en la base. */
const clave = () => crypto.createHash('sha256').update('cifrado:' + config.secret).digest();
function cifrar(txt) {
  if (txt == null || txt === '') return txt;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const enc = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return 'v1:' + b64url(Buffer.concat([iv, c.getAuthTag(), enc]));
}
function descifrar(txt) {
  if (!txt || !String(txt).startsWith('v1:')) return txt;
  try {
    const raw = unb64url(String(txt).slice(3));
    const d = crypto.createDecipheriv('aes-256-gcm', clave(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ahora = () => new Date().toISOString();

function fechaLinda(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const plata = (n) => config.moneda + ' ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });

module.exports = { b64url, unb64url, firmar, verificar, cifrar, descifrar, sha256, esc, ahora, fechaLinda, plata };
