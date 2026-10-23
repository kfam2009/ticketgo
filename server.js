'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./lib/config');
const auth = require('./lib/auth');
const { enviar, json } = require('./lib/http');
const { publico } = require('./lib/vistas');

const rutas = [require('./rutas/ver'), require('./rutas/admin'), require('./rutas/panel'), require('./rutas/publico')];

const ESTATICOS = { '/img/logo.svg': 'image/svg+xml', '/img/icono.svg': 'image/svg+xml', '/img/icono.png': 'image/png' };

async function atender(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  if (p === '/salud') return json(res, 200, { ok: true });
  if (p === '/robots.txt') return enviar(res, 200, 'User-agent: *\nDisallow: /panel\nDisallow: /admin\nDisallow: /ver\nDisallow: /v/\nDisallow: /compra\n', 'text/plain');
  if (ESTATICOS[p]) {
    res.writeHead(200, { 'Content-Type': ESTATICOS[p], 'Cache-Control': 'public, max-age=86400' });
    return fs.createReadStream(path.join(__dirname, 'public', p)).pipe(res);
  }
  const partes = p.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
  for (const r of rutas) {
    if (await r.manejar(req, res, url, partes)) return;
  }
  enviar(res, 404, publico({ titulo: 'No encontrado', cuerpo: '<h1>Página no encontrada</h1><p class="sub">Revisá la dirección.</p><a class="btn" href="/">Ir al inicio</a>' }));
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  atender(req, res).catch((e) => {
    console.error('[error]', req.method, req.url, e);
    if (res.headersSent) return res.end();
    const codigo = e.status === 413 ? 413 : 500;
    if (String(req.url).startsWith('/ver/') || String(req.url).startsWith('/pagos/')) return json(res, codigo, { error: 'Error interno' });
    enviar(res, codigo, publico({ titulo: 'Error', cuerpo: `<h1>${codigo === 413 ? 'El archivo es demasiado grande' : 'Algo salió mal'}</h1><p class="sub">Probá de nuevo en un momento.</p>` }));
  });
});

if (require.main === module) {
  auth.asegurarAdmin();
  server.listen(config.port, () => console.log(`${config.marca} escuchando en el puerto ${config.port}`));
}
module.exports = server;
