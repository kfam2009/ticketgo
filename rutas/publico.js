'use strict';
const crypto = require('node:crypto');
const config = require('../lib/config');
const { db } = require('../lib/db');
const { esc, firmar } = require('../lib/util');
const { enviar, json, redirigir, leerCuerpo, baseUrl, ipDe, limite } = require('../lib/http');
const { publico, suelta } = require('../lib/vistas');
const { intro } = require('../lib/logo-animado');
const { mensaje } = require('../lib/reproductor');
const auth = require('../lib/auth');
const ventas = require('../lib/ventas');
const D = require('../lib/datos');

const MAX_POR_COMPRA = 10;

function servirImagen(res, dataUrl) {
  const m = dataUrl && /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/.exec(dataUrl);
  if (!m) return enviar(res, 404, 'No encontrado', 'text/plain');
  return enviar(res, 200, Buffer.from(m[2], 'base64'), m[1], { 'Cache-Control': 'public, max-age=86400', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
}

const imgEvento = (e) => (e.imagen ? `/img-evento/${e.id}?v=${e.imagen.length}` : '');

function tarjetaEvento(e, mostrarProductora) {
  const enVivo = e.fecha && new Date(e.fecha) <= new Date() ? '<span class="pill rojo">EN VIVO / HOY</span>' : '';
  return `<a class="ev" href="/${esc(e.slug)}/${e.id}">
    <div class="img" style="${e.imagen ? `background-image:url('${imgEvento(e)}')` : 'background:linear-gradient(135deg,#1d2029,#2a1418)'}">${enVivo}</div>
    <div class="cuerpo">${mostrarProductora ? `<span class="prod">${esc(e.productora)}</span>` : ''}
      <h3>${esc(e.titulo)}</h3><span class="muted">${D.fechaLinda(e.fecha)}${e.lugar ? ' · ' + esc(e.lugar) : ''}</span>
      <span class="precio">${Number(e.precio) > 0 ? D.plata(e.precio) : 'Gratis'}</span></div></a>`;
}

const listar = (where, args) => db.prepare(`SELECT e.id, e.titulo, e.fecha, e.lugar, e.precio, e.imagen, p.slug, p.nombre AS productora
    FROM eventos e JOIN productoras p ON p.id = e.productora_id
    WHERE e.estado = 'publicado' AND p.estado <> 'suspendida' AND (e.fecha IS NULL OR e.fecha >= ?) ${where}
    ORDER BY e.fecha IS NULL, e.fecha LIMIT 60`).all(new Date(Date.now() - 12 * 3600 * 1000).toISOString(), ...args);

/* ------------------------------------------------------------------ PayPal (exterior) */
/** Botón de PayPal. Hasta que se conecte la cuenta, el pedido se hace por WhatsApp con un link de pago. */
function paypalBloque(p, e) {
  const wa = String(p.whatsapp || config.whatsapp).replace(/\D/g, '');
  const texto = `Hola! Quiero comprar desde el exterior con PayPal una entrada para "${e.titulo}" (USD ${e.precio_usd}).`;
  return `<div class="pp">
    <div class="pp-sep"><span>¿Estás fuera de Argentina?</span></div>
    <button type="button" class="pp-btn" onclick="document.getElementById('ppinfo').hidden=false;this.hidden=true">Pagar con <b>Pay</b><i>Pal</i></button>
    <div id="ppinfo" hidden class="pp-info">
      <b>Compra con PayPal — USD ${esc(Number(e.precio_usd).toLocaleString('es-AR', { maximumFractionDigits: 2 }))}</b>
      <p>Escribinos y te mandamos el link de pago de PayPal. Apenas se acredite, te llega tu acceso por mail, igual que una compra con Mercado Pago.</p>
      <a class="btn ancho" style="background:#25d366;color:#05210f" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Pedir link de PayPal por WhatsApp</a>
    </div>
    <small class="muted" style="display:block;text-align:center;margin-top:8px">Tarjetas internacionales y saldo PayPal · precio en dólares</small></div>`;
}

/* ------------------------------------------------------------------ portada */
function portada(req, res) {
  const evs = listar("AND p.estado = 'activa'", []);
  const cuerpo = `${intro('<span class="vivo"><i></i>En vivo</span> · Entradas <b>·</b> Transmisiones')}
    <section class="hero" style="padding-top:18px"><h1>Mirá en vivo los eventos<br>que te importan.</h1>
    <p class="sub" style="max-width:620px">Comprá tu entrada con Mercado Pago —o con PayPal si estás en el exterior— y recibí tu acceso al instante. Lo ves desde el celular, la compu o la tele.</p></section>
    <h2>Próximos eventos</h2>
    ${evs.length ? `<div class="grid">${evs.map((e) => tarjetaEvento(e, true)).join('')}</div>` : '<div class="card muted">Pronto vas a ver acá los próximos eventos.</div>'}
    <div class="card" style="margin-top:34px;display:flex;gap:18px;align-items:center;flex-wrap:wrap;justify-content:space-between;border-color:rgba(76,201,240,.35)">
      <div><h3 style="font-size:24px">¿Sos productora u organizás eventos?</h3><span class="muted">Creá tu página, cargá tus eventos y cobrá con tu Mercado Pago. Vos transmitís, nosotros nos ocupamos de las entradas.</span></div>
      <a class="btn" href="/registro">Registrar mi productora</a></div>`;
  enviar(res, 200, publico({ titulo: 'Entradas para transmisiones en vivo', cuerpo, descripcion: 'Entradas para transmisiones en vivo.' }));
}

/* ------------------------------------------------------------------ productora */
function paginaProductora(req, res, p) {
  const evs = listar('AND p.id = ?', [p.id]);
  const cuerpo = `${p.estado === 'test' ? '<div class="modotest">Esta productora está en modo prueba: las compras son de prueba y no se cobran.</div>' : ''}
    <div class="prodcab">${p.logo ? `<img src="/logo/${p.id}?v=${p.logo.length}" alt="">` : ''}<div><h1>${esc(p.nombre)}</h1>${p.descripcion ? `<p class="sub" style="margin:0">${esc(p.descripcion)}</p>` : ''}</div></div>
    <div class="fila" style="margin-bottom:10px">${p.whatsapp ? `<a class="btn sec chico" href="https://wa.me/${esc(p.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${p.instagram ? `<a class="btn sec chico" href="https://instagram.com/${esc(p.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener">Instagram</a>` : ''}</div>
    <h2>Próximos eventos</h2>
    ${evs.length ? `<div class="grid">${evs.map((e) => tarjetaEvento(e, false)).join('')}</div>` : '<div class="card muted">No hay eventos publicados por ahora.</div>'}`;
  enviar(res, 200, publico({ titulo: 'Eventos', cuerpo, productora: p }));
}

/* ------------------------------------------------------------------ evento y compra */
async function paginaEvento(req, res, p, e) {
  const u = auth.usuarioActual(req);
  const esDueno = u && (u.rol === 'admin' || u.productora_id === p.id);
  if (!e || e.productora_id !== p.id || (e.estado === 'borrador' && !esDueno)) {
    return enviar(res, 404, publico({ titulo: 'No encontrado', cuerpo: '<h1>Evento no encontrado</h1>', productora: p }));
  }
  const prueba = p.estado === 'test';
  const quedanCupo = e.cupo ? Math.max(0, Number(e.cupo) - ventas.vendidas(e.id)) : MAX_POR_COMPRA;
  const termino = e.fecha && new Date(e.fecha).getTime() < Date.now() - 12 * 3600 * 1000;
  let motivo = '';
  if (p.estado === 'suspendida') motivo = 'La venta de esta productora está pausada.';
  else if (e.estado === 'borrador') motivo = 'Este evento todavía es un borrador (solo lo ves vos).';
  else if (!e.venta_activa) motivo = 'La venta para este evento está cerrada.';
  else if (termino) motivo = 'Este evento ya terminó.';
  else if (quedanCupo < 1) motivo = 'Entradas agotadas.';
  else if (!prueba && Number(e.precio) > 0 && !config.mpListo()) motivo = 'La venta online todavía no está habilitada.';

  let errores = [];
  const d = req.method === 'POST' ? await leerCuerpo(req) : {};
  if (req.method === 'POST' && !motivo) {
    const email = String(d.email || '').trim().toLowerCase();
    const cantidad = parseInt(d.cantidad, 10) || 1;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) errores.push('Revisá el email: ahí te llega tu acceso.');
    if (cantidad < 1 || cantidad > Math.min(MAX_POR_COMPRA, quedanCupo)) errores.push(`Elegí entre 1 y ${Math.min(MAX_POR_COMPRA, quedanCupo)} entradas.`);
    if (!limite('compra:' + ipDe(req), 20, 3600 * 1000)) errores.push('Demasiados intentos. Probá más tarde.');
    if (!errores.length) {
      const monto = Math.round(cantidad * Number(e.precio) * 100) / 100;
      const token = crypto.randomBytes(16).toString('hex');
      const r = db.prepare(`INSERT INTO ordenes (evento_id, productora_id, email, nombre, telefono, cantidad, monto, comision, estado, token, creado, modificado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)`).run(e.id, p.id, email, String(d.nombre || '').trim().slice(0, 120),
        String(d.telefono || '').replace(/[^0-9+ ]/g, '').slice(0, 30), cantidad, monto, prueba ? 0 : ventas.comisionDe(p, monto, cantidad), token, new Date().toISOString(), new Date().toISOString());
      const orden = db.prepare('SELECT * FROM ordenes WHERE id = ?').get(r.lastInsertRowid);
      const base = baseUrl(req);
      if (prueba || monto === 0) {
        await ventas.compraDePrueba(orden, base);
        if (!prueba) db.prepare("UPDATE ordenes SET estado = 'aprobado' WHERE id = ?").run(orden.id);
        return redirigir(res, `/compra/${token}`);
      }
      try {
        const cobro = await ventas.crearCobro(orden, e, p, base);
        db.prepare('UPDATE ordenes SET mp_preference_id = ? WHERE id = ?').run(cobro.id, orden.id);
        return redirigir(res, cobro.url);
      } catch (err) {
        errores = ['No pudimos conectar con Mercado Pago. Probá de nuevo en un minuto.'];
      }
    }
  }
  const opciones = Array.from({ length: Math.min(MAX_POR_COMPRA, quedanCupo) }, (_, i) => `<option value="${i + 1}" ${String(d.cantidad) === String(i + 1) ? 'selected' : ''}>${i + 1}</option>`).join('');
  const cuerpo = `${prueba ? '<div class="modotest">Modo prueba: esta compra es de prueba y no se cobra. Sirve para ver cómo funciona todo.</div>' : ''}
  <div class="dos" style="align-items:start">
    <div>${e.imagen ? `<img src="${imgEvento(e)}" alt="" style="width:100%;border-radius:16px;display:block;margin-bottom:16px">` : ''}
      <a href="/${esc(p.slug)}" class="muted" style="text-decoration:none;font-weight:600">${esc(p.nombre)}</a>
      <h1>${esc(e.titulo)}</h1><p class="muted" style="margin:0 0 12px">${D.fechaLinda(e.fecha)}${e.lugar ? ' · ' + esc(e.lugar) : ''}</p>
      ${e.descripcion ? `<p style="white-space:pre-line">${esc(e.descripcion)}</p>` : ''}
      <div class="card" style="margin-top:14px"><b>Cómo funciona</b><ol class="muted" style="margin:8px 0 0;padding-left:20px">
        <li>Pagás con Mercado Pago (tarjeta, débito o dinero en cuenta)${Number(e.precio_usd) > 0 ? ', o con PayPal si estás en el exterior' : ''}.</li><li>Recibís al instante tu link de acceso, en pantalla y por mail.</li>
        <li>El día del evento lo abrís y mirás. Cada entrada funciona en una pantalla a la vez.</li></ol></div></div>
    <div class="card" style="position:sticky;top:80px">
      <span class="muted">Entrada</span><div class="cond" style="font-size:38px;font-weight:800;line-height:1.1">${Number(e.precio) > 0 ? D.plata(e.precio) : 'Gratis'}</div>
      ${Number(e.precio_usd) > 0 ? `<div class="muted" style="margin-top:2px">Desde el exterior: <b style="color:#fff">USD ${esc(Number(e.precio_usd).toLocaleString('es-AR', { maximumFractionDigits: 2 }))}</b> con PayPal</div>` : ''}
      ${e.cupo && quedanCupo <= 20 && quedanCupo > 0 ? `<p class="pill amarillo">Quedan ${quedanCupo}</p>` : ''}
      ${motivo ? `<div class="aviso" style="margin-top:12px">${esc(motivo)}</div>` : `
      ${errores.length ? `<div class="error">${errores.map(esc).join('<br>')}</div>` : ''}
      <form method="post">
        <label>Cantidad de entradas</label><select name="cantidad">${opciones}</select>
        <label>Tu email (ahí te llega el acceso)</label><input type="email" name="email" required maxlength="120" value="${esc(d.email || '')}" autocomplete="email">
        <label>Nombre (opcional)</label><input name="nombre" maxlength="120" value="${esc(d.nombre || '')}" autocomplete="name">
        <label>WhatsApp (opcional)</label><input name="telefono" maxlength="30" value="${esc(d.telefono || '')}" inputmode="tel">
        <button class="btn ancho" style="margin-top:18px">${prueba ? 'Hacer compra de prueba' : Number(e.precio) > 0 ? 'Pagar con Mercado Pago' : 'Obtener acceso gratis'}</button>
      </form>
      ${Number(e.precio_usd) > 0 ? paypalBloque(p, e) : ''}`}
    </div></div>`;
  enviar(res, errores.length ? 422 : 200, publico({ titulo: e.titulo, cuerpo, productora: p, descripcion: `${e.titulo} — ${p.nombre}` }));
}

async function compra(req, res, token, url) {
  if (!/^[a-f0-9]{32}$/.test(token)) return enviar(res, 404, mensaje('Compra no encontrada', ''));
  let o = db.prepare('SELECT * FROM ordenes WHERE token = ?').get(token);
  if (!o) return enviar(res, 404, mensaje('Compra no encontrada', ''));
  const base = baseUrl(req);
  if (o.estado === 'pendiente' && config.mpListo()) {
    const pid = url.searchParams.get('payment_id') || url.searchParams.get('collection_id');
    try {
      if (pid && /^\d+$/.test(pid)) await ventas.procesarPago(pid, base);
      else await ventas.revisarOrden(o.id, base);
    } catch (e) { console.error('[compra]', e.message); }
    o = db.prepare('SELECT * FROM ordenes WHERE token = ?').get(token);
  }
  const e = D.evento(o.evento_id);
  const p = D.productora(o.productora_id);
  const ok = ['aprobado', 'prueba'].includes(o.estado);
  let cuerpo;
  if (ok) {
    const links = ventas.accesosDe(o.id, base);
    cuerpo = `<div class="card" style="max-width:640px;margin:0 auto">
      <span class="pill verde">${o.estado === 'prueba' ? 'COMPRA DE PRUEBA' : 'PAGO APROBADO'}</span>
      <h1 style="margin-top:10px">¡Listo! Ya tenés tu acceso</h1>
      <p class="muted">${esc(e.titulo)} · ${D.fechaLinda(e.fecha)}</p>
      <p>${links.length > 1 ? 'Cada link es una entrada distinta: compartí uno por persona.' : 'Guardá este link: es tu entrada.'} También te lo mandamos a <b>${esc(o.email)}</b> (revisá spam).</p>
      ${links.map((l, i) => `<div class="card" style="background:var(--bg2);margin-top:10px"><div class="fila" style="justify-content:space-between">
        <div><small>Entrada ${i + 1}</small><div class="cond" style="font-size:26px;font-weight:800;letter-spacing:.06em">${esc(l.codigo)}</div><code id="l${i}" style="font-size:12px;color:var(--muted)">${esc(l.url)}</code></div>
        <div class="fila"><button class="btn sec chico" data-copiar="l${i}">Copiar link</button><a class="btn chico" href="${esc(l.url)}">Ver</a></div></div></div>`).join('')}
      <p class="muted" style="font-size:13px;margin-top:16px">Para ver en la tele: abrí el link en el navegador de la tele, o mandalo con el botón de transmitir desde el celular.</p></div>`;
  } else if (o.estado === 'pendiente' || o.estado === 'procesando') {
    cuerpo = `<div class="card" style="max-width:560px;margin:0 auto;text-align:center"><h1>Estamos esperando tu pago</h1>
      <p class="muted">Si pagaste en efectivo o el pago está en revisión, apenas Mercado Pago lo acredite te llega el acceso por mail. Esta página se actualiza sola.</p></div>
      <script>setInterval(function(){fetch('/compra/${token}/estado').then(function(r){return r.json()}).then(function(d){if(d.estado!=='pendiente'&&d.estado!=='procesando')location.reload()})},8000)</script>`;
  } else {
    cuerpo = `<div class="card" style="max-width:560px;margin:0 auto;text-align:center"><h1>${o.estado === 'devuelto' ? 'Compra devuelta' : 'El pago no se completó'}</h1>
      <p class="muted">${o.estado === 'devuelto' ? 'Esta compra fue devuelta y sus accesos están anulados.' : 'No se cobró nada.'}</p>
      <a class="btn" href="/${esc(p.slug)}/${e.id}">Volver al evento</a></div>`;
  }
  enviar(res, 200, publico({ titulo: 'Tu compra', cuerpo, productora: p }));
}

async function misEntradas(req, res) {
  let aviso = '';
  if (req.method === 'POST') {
    const b = await leerCuerpo(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) aviso = '<div class="error">Revisá el email.</div>';
    else if (!limite('mis:' + ipDe(req), 5, 3600e3) || !limite('mis:' + email, 3, 3600e3)) aviso = '<div class="error">Ya pediste varios reenvíos. Esperá un rato y revisá también spam.</div>';
    else {
      const ords = db.prepare("SELECT id FROM ordenes WHERE email = ? AND estado IN ('aprobado', 'prueba') AND creado >= ? ORDER BY id DESC LIMIT 10")
        .all(email, new Date(Date.now() - 180 * 864e5).toISOString());
      for (const o of ords) await ventas.enviarAccesos(o.id, baseUrl(req));
      aviso = `<div class="ok">Si <b>${esc(email)}</b> tiene compras, te reenviamos los accesos. Revisá también spam o promociones.</div>`;
    }
  }
  const cuerpo = `<div class="card" style="max-width:520px;margin:20px auto"><h1>Mis entradas</h1>
    <p class="muted">¿Perdiste tu link? Escribí el email con el que compraste y te reenviamos todos tus accesos.</p>${aviso}
    <form method="post"><input type="email" name="email" required placeholder="tu@mail.com" autocomplete="email"><button class="btn ancho" style="margin-top:12px">Reenviarme mis entradas</button></form></div>`;
  enviar(res, 200, publico({ titulo: 'Mis entradas', cuerpo }));
}

/* ------------------------------------------------------------------ ingreso de productoras */
async function ingresar(req, res, url) {
  let err = '';
  if (req.method === 'POST') {
    const b = await leerCuerpo(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!limite('login:' + ipDe(req), 10, 15 * 60e3)) err = 'Demasiados intentos. Esperá unos minutos.';
    else {
      const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
      if (u && auth.claveOk(b.clave || '', u.clave)) {
        return redirigir(res, u.rol === 'admin' ? '/admin' : '/panel', { 'Set-Cookie': auth.iniciarSesion(req, res, u) });
      }
      err = 'Email o clave incorrectos.';
    }
  }
  const cuerpo = `<div class="card"><h1>Ingresar</h1><p class="muted">Panel para productoras.</p>
    ${err ? `<div class="error">${esc(err)}</div>` : ''}${url.searchParams.get('ok') ? '<div class="ok">Listo, ya podés ingresar.</div>' : ''}
    <form method="post"><label>Email</label><input type="email" name="email" required autocomplete="email">
    <label>Clave</label><input type="password" name="clave" required autocomplete="current-password">
    <button class="btn ancho" style="margin-top:18px">Entrar</button></form>
    <p class="muted" style="text-align:center;margin:16px 0 0">¿No tenés cuenta? <a href="/registro">Registrá tu productora</a></p>
    <p class="muted" style="text-align:center;font-size:13px;margin:8px 0 0">¿Olvidaste la clave? <a href="https://wa.me/${esc(config.whatsapp)}" target="_blank" rel="noopener">Escribinos</a></p></div>
    <p style="text-align:center;margin-top:16px"><a href="/mis-entradas" class="muted">¿Compraste una entrada? Recuperala acá</a></p>`;
  enviar(res, err ? 401 : 200, suelta({ titulo: 'Ingresar', cuerpo }));
}

async function registro(req, res) {
  let err = '';
  const b = req.method === 'POST' ? await leerCuerpo(req) : {};
  if (req.method === 'POST') {
    const nombre = String(b.productora || '').trim().slice(0, 80);
    const slug = D.slugDe(b.slug || nombre);
    const email = String(b.email || '').trim().toLowerCase();
    if (!limite('registro:' + ipDe(req), 5, 3600e3)) err = 'Demasiados registros desde esta conexión. Probá más tarde.';
    else if (nombre.length < 2) err = 'Poné el nombre de tu productora.';
    else if (slug.length < 3 || D.RESERVADOS.has(slug)) err = 'Elegí otra dirección para tu página (mínimo 3 letras).';
    else if (D.productoraPorSlug(slug)) err = `La dirección "${slug}" ya está en uso. Probá con otra.`;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err = 'Revisá el email.';
    else if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) err = 'Ese email ya tiene cuenta. Ingresá con tu clave.';
    else if (String(b.clave || '').length < 8) err = 'La clave tiene que tener al menos 8 caracteres.';
    else if (!b.acepto) err = 'Tenés que aceptar las condiciones.';
    else {
      const ahora = new Date().toISOString();
      const pr = db.prepare("INSERT INTO productoras (nombre, slug, whatsapp, estado, creado) VALUES (?, ?, ?, 'test', ?)")
        .run(nombre, slug, String(b.whatsapp || '').replace(/[^0-9+]/g, '').slice(0, 20), ahora);
      const ur = db.prepare("INSERT INTO usuarios (email, nombre, clave, rol, productora_id, creado) VALUES (?, ?, ?, 'productora', ?, ?)")
        .run(email, String(b.nombre || '').trim().slice(0, 80), auth.hashClave(b.clave), pr.lastInsertRowid, ahora);
      console.log('[registro] nueva productora', nombre, slug);
      const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(ur.lastInsertRowid);
      return redirigir(res, '/panel?bienvenida=1', { 'Set-Cookie': auth.iniciarSesion(req, res, u) });
    }
  }
  const cuerpo = `<div class="card"><h1>Registrá tu productora</h1><p class="muted">Empezás en <b>modo prueba</b>: cargás tus eventos y probás todo sin cobrar. Cuando estés listo, te activamos para vender.</p>
    ${err ? `<div class="error">${esc(err)}</div>` : ''}
    <form method="post">
      <label>Nombre de la productora</label><input name="productora" required maxlength="80" value="${esc(b.productora || '')}" id="np">
      <label>Dirección de tu página</label><div class="fila" style="flex-wrap:nowrap;gap:6px"><span class="muted" style="white-space:nowrap">…/</span><input name="slug" maxlength="40" value="${esc(b.slug || '')}" id="sl" placeholder="mi-productora"></div>
      <label>Tu nombre</label><input name="nombre" maxlength="80" value="${esc(b.nombre || '')}" autocomplete="name">
      <label>Email</label><input type="email" name="email" required value="${esc(b.email || '')}" autocomplete="email">
      <label>WhatsApp</label><input name="whatsapp" value="${esc(b.whatsapp || '')}" inputmode="tel" placeholder="2914000000">
      <label>Clave (mínimo 8 caracteres)</label><input type="password" name="clave" required minlength="8" autocomplete="new-password">
      <label class="check" style="margin-top:16px"><input type="checkbox" name="acepto" value="1" required> Acepto que ${esc(config.marca)} cobre una comisión por cada entrada vendida.</label>
      <button class="btn ancho" style="margin-top:18px">Crear mi cuenta</button></form>
    <p class="muted" style="text-align:center;margin:16px 0 0">¿Ya tenés cuenta? <a href="/ingresar">Ingresá</a></p></div>
    <script>(function(){var n=document.getElementById('np'),s=document.getElementById('sl'),toc=!!s.value;s.oninput=function(){toc=true};
    n.oninput=function(){if(toc)return;s.value=n.value.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)}})()</script>`;
  enviar(res, err ? 422 : 200, suelta({ titulo: 'Registrá tu productora', cuerpo }));
}

/* ------------------------------------------------------------------ links de acceso */
function linkCodigo(req, res, codigo) {
  if (!limite('cod:' + ipDe(req), 30, 10 * 60e3)) return enviar(res, 429, mensaje('Demasiados intentos', 'Esperá unos minutos.'));
  const a = db.prepare('SELECT * FROM accesos WHERE codigo = ?').get(ventas.normalizarCodigo(codigo));
  if (!a) return enviar(res, 404, mensaje('Código no válido', 'Revisá el link que te llegó con tu entrada, o pedilo de nuevo en Mis entradas.'));
  if (a.revocado) return enviar(res, 403, mensaje('Esta entrada fue anulada', ''));
  return redirigir(res, `/ver/${firmar({ a: a.id, e: Math.floor(Date.now() / 1000) + 12 * 3600 })}`);
}

/* ------------------------------------------------------------------ webhook de Mercado Pago */
async function webhookMP(req, res, url) {
  const b = await leerCuerpo(req).catch(() => ({}));
  const tipo = b.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const id = (b.data && b.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id');
  if (tipo === 'payment' && id && /^\d+$/.test(String(id)) && config.mpListo()) {
    try {
      await ventas.procesarPago(String(id), baseUrl(req));
    } catch (e) {
      console.error('[webhook]', id, e.message);
      if (e.status === 404) return json(res, 200, { ok: true });
      return json(res, 500, { error: 'reintentar' });
    }
  }
  return json(res, 200, { ok: true });
}

/* ------------------------------------------------------------------ enrutador */
async function manejar(req, res, url, partes) {
  const p0 = partes[0];
  if (!p0) return portada(req, res), true;
  if (p0 === 'logo' && /^\d+$/.test(partes[1] || '')) { const p = D.productora(Number(partes[1])); return servirImagen(res, p && p.logo), true; }
  if (p0 === 'img-evento' && /^\d+$/.test(partes[1] || '')) { const e = D.evento(Number(partes[1])); return servirImagen(res, e && e.imagen), true; }
  if (p0 === 'v' && partes[1]) return linkCodigo(req, res, partes[1]), true;
  if (p0 === 'compra' && partes[1]) {
    if (partes[2] === 'estado') { const o = db.prepare('SELECT estado FROM ordenes WHERE token = ?').get(partes[1]); return json(res, o ? 200 : 404, { estado: o ? o.estado : null }), true; }
    return await compra(req, res, partes[1], url), true;
  }
  if (p0 === 'pagos' && partes[1] === 'mp') return await webhookMP(req, res, url), true;
  if (p0 === 'mis-entradas') return await misEntradas(req, res), true;
  if (p0 === 'ingresar') return await ingresar(req, res, url), true;
  if (p0 === 'registro') return await registro(req, res), true;
  if (p0 === 'salir') return redirigir(res, '/', { 'Set-Cookie': auth.cerrarSesion() }), true;
  if (partes.length <= 2 && !D.RESERVADOS.has(p0)) {
    const p = D.productoraPorSlug(p0);
    if (!p) return false;
    if (partes.length === 1) return paginaProductora(req, res, p), true;
    if (/^\d+$/.test(partes[1])) return await paginaEvento(req, res, p, D.evento(Number(partes[1]))), true;
  }
  return false;
}

module.exports = { manejar };
