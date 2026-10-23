'use strict';
const { db } = require('./db');
const { esc } = require('./util');
const config = require('./config');

const RESERVADOS = new Set(['admin', 'panel', 'api', 'ver', 'v', 'img', 'logo', 'compra', 'pagos', 'ingresar', 'salir', 'registro',
  'mis-entradas', 'salud', 'robots.txt', 'js', 'img-evento', 'tv', 'ayuda', 'terminos', 'privacidad', 'ticketgo', 'eventos']);

const slugDe = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const productoraPorSlug = (slug) => db.prepare('SELECT * FROM productoras WHERE slug = ?').get(String(slug || '').toLowerCase());
const productora = (id) => db.prepare('SELECT * FROM productoras WHERE id = ?').get(id);
const evento = (id) => db.prepare('SELECT * FROM eventos WHERE id = ?').get(id);

function fechaLinda(iso, corta) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  const o = corta
    ? { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleString('es-AR', o) + ' hs';
}

/** "2026-10-25T21:00" (hora argentina) → ISO. */
function fechaDeInput(v) {
  if (!v) return null;
  const d = new Date(String(v).length === 16 ? v + ':00-03:00' : v);
  return isNaN(d) ? null : d.toISOString();
}
/** ISO → valor para <input type=datetime-local> en hora argentina. */
function fechaAInput(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return isNaN(d) ? '' : d.toISOString().slice(0, 16);
}

const plata = (n) => config.moneda + ' ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });

const imagenValida = (s, maxBytes = 600 * 1024) => typeof s === 'string' && s.length <= maxBytes * 1.37
  && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);

module.exports = { RESERVADOS, slugDe, productoraPorSlug, productora, evento, fechaLinda, fechaDeInput, fechaAInput, plata, imagenValida };
