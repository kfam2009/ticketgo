'use strict';
const config = require('../lib/config');
const { db, transaccion } = require('../lib/db');
const { esc, firmar, cifrar, descifrar } = require('../lib/util');
const { enviar, redirigir, leerCuerpo, baseUrl } = require('../lib/http');
const { panel, accion } = require('../lib/vistas');
const auth = require('../lib/auth');
const cf = require('../lib/cloudflare');
const { estadoEvento, olvidar } = require('../lib/estado');
const ventas = require('../lib/ventas');
const D = require('../lib/datos');

const ESTADOS_EV = { borrador: ['Borrador', ''], publicado: ['Publicado', 'verde'], oculto: ['Oculto (solo con link)', 'amarillo'] };
const pillEv = (e) => `<span class="pill ${ESTADOS_EV[e][1]}">${ESTADOS_EV[e][0]}</span>`;
const SEÑAL = { vivo: ['EN VIVO', 'rojo'], repeticion: ['Repetición', 'verde'], procesando: ['Preparando repetición', 'amarillo'], espera: ['Sin señal', ''], terminado: ['Finalizado', ''], cerrado: ['Pausado', ''], error: ['Sin datos', ''] };
const pillSeñal = (s) => `<span class="pill ${(SEÑAL[s] || SEÑAL.error)[1]}">${(SEÑAL[s] || SEÑAL.error)[0]}</span>`;
const ESTADOS_OR = { aprobado: ['Aprobada', 'verde'], prueba: ['Prueba', 'cyan'], pendiente: ['Pendiente', 'amarillo'], procesando: ['Procesando', 'amarillo'], rechazado: ['Rechazada', ''], devuelto: ['Devuelta', 'rojo'] };
const pillOr = (s) => `<span class="pill ${(ESTADOS_OR[s] || ['', ''])[1]}">${(ESTADOS_OR[s] || [s])[0]}</span>`;

function pagina(res, ctx, titulo, cuerpo, activo, codigo = 200) {
  enviar(res, codigo, panel({ titulo, cuerpo, usuario: ctx.u, productora: ctx.p, activo }));
}

/* ------------------------------------------------------------------ inicio */
async function inicio(req, res, ctx, url) {
  const { p } = ctx;
  const r = db.prepare(`SELECT
      (SELECT COUNT(*) FROM eventos WHERE productora_id = ? AND (fecha IS NULL OR fecha >= ?)) AS proximos,
      COALESCE(SUM(CASE WHEN estado = 'aprobado' THEN cantidad END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN estado = 'aprobado' THEN monto - comision END), 0) AS neto,
      COALESCE(SUM(CASE WHEN estado = 'prueba' THEN cantidad END), 0) AS pruebas
    FROM ordenes WHERE productora_id = ?`).get(p.id, new Date(Date.now() - 12 * 3600e3).toISOString(), p.id);
  const mirando = db.prepare('SELECT COUNT(*) AS n FROM accesos a JOIN eventos e ON e.id = a.evento_id WHERE e.productora_id = ? AND a.sesion_latido > ?').get(p.id, Date.now() - 60e3).n;
  const bienvenida = url.searchParams.get('bienvenida') ? `<div class="ok"><b>¡Bienvenido a ${esc(config.marca)}!</b> Tu página ya existe: <a href="/${esc(p.slug)}" target="_blank">${esc(baseUrl(req))}/${esc(p.slug)}</a>. Empezá creando tu primer evento.</div>` : '';
  const test = p.estado === 'test' ? `<div class="modotest">Estás en <b>modo test</b>: podés crear eventos, transmitir y hacer compras de prueba sin cobrar.
    Cuando quieras vender de verdad, <a href="https://wa.me/${esc(config.whatsapp)}?text=${encodeURIComponent(`Hola! Quiero activar mi productora ${p.nombre} en ${config.marca}`)}" target="_blank" rel="noopener" style="color:#fff">comunicate con ${esc(config.marca)} para activar tu perfil</a>.</div>` : '';
  const susp = p.estado === 'suspendida' ? '<div class="error">Tu productora está suspendida: la venta está pausada. Comunicate con nosotros.</div>' : '';
  const prox = db.prepare(`SELECT e.*, (SELECT COALESCE(SUM(cantidad),0) FROM ordenes o WHERE o.evento_id = e.id AND o.estado = 'aprobado') AS vendidas
      FROM eventos e WHERE e.productora_id = ? AND (e.fecha IS NULL OR e.fecha >= ?) ORDER BY e.fecha IS NULL, e.fecha LIMIT 1`).get(p.id, new Date(Date.now() - 12 * 3600e3).toISOString());
  const cuentas = db.prepare(`SELECT COUNT(*) AS evs, COUNT(CASE WHEN estado = 'publicado' THEN 1 END) AS pub,
      (SELECT COUNT(*) FROM accesos a JOIN eventos e2 ON e2.id = a.evento_id WHERE e2.productora_id = ? AND a.primera_vista IS NOT NULL) AS vistas
      FROM eventos WHERE productora_id = ?`).get(p.id, p.id);
  const pasos = [
    [!!p.logo, 'Subí el logo de tu productora', '/panel/perfil', 'Mi página'],
    [cuentas.evs > 0, 'Creá tu primer evento', '/panel/eventos/nuevo', 'Crear'],
    [cuentas.pub > 0, 'Publicalo para que aparezca en tu página', '/panel/eventos', 'Eventos'],
    [cuentas.vistas > 0, 'Probá la transmisión desde vMix u OBS', prox ? `/panel/eventos/${prox.id}/transmision` : '/panel/eventos', 'Probar'],
    [p.estado === 'activa', 'Pedí la activación para vender de verdad', `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(`Hola! Quiero activar mi productora ${p.nombre} en ${config.marca}`)}`, 'Pedir'],
  ];
  const hechos = pasos.filter((x) => x[0]).length;
  const listaPasos = hechos < pasos.length ? `<div class="card" style="margin-bottom:18px"><div class="fila" style="justify-content:space-between"><h3>Primeros pasos</h3><small>${hechos} de ${pasos.length}</small></div>
    <div class="barrita"><i style="width:${Math.round(hechos / pasos.length * 100)}%"></i></div>
    <ol class="pasos">${pasos.map(([ok, t, h, b], i) => `<li class="${ok ? 'hecho' : ''}"><span class="n">${ok ? '✓' : i + 1}</span><span>${esc(t)}</span>${ok ? '' : `<a class="btn sec chico" href="${esc(h)}" ${h.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${b}</a>`}</li>`).join('')}</ol></div>` : '';
  let destacado = '';
  if (prox) {
    const est = await estadoEvento({ ...prox, activo: 1 }).catch(() => ({ estado: 'error' }));
    destacado = `<h2 style="margin-top:0">Próximo evento</h2><div class="card destacado" style="margin-bottom:18px">
      <div class="img" style="${prox.imagen ? `background-image:url('/img-evento/${prox.id}?v=${prox.imagen.length}')` : 'background:linear-gradient(135deg,#1d2029,#2a1418)'}"></div>
      <div><div class="fila" style="gap:6px;margin-bottom:6px">${pillSeñal(est.estado)} ${pillEv(prox.estado)}</div>
        <h3 style="font-size:26px">${esc(prox.titulo)}</h3><p class="muted" style="margin:2px 0 12px">${D.fechaLinda(prox.fecha) || 'Sin fecha'} · ${prox.vendidas}${prox.cupo ? ' / ' + prox.cupo : ''} entradas vendidas</p>
        <div class="fila"><a class="btn" href="/panel/eventos/${prox.id}/transmision">Transmitir</a><a class="btn sec" href="/panel/ventas?evento=${prox.id}">Ventas</a>
        <a class="btn sec" href="/panel/eventos/${prox.id}">Editar</a><code id="lk" hidden>${esc(baseUrl(req))}/${esc(p.slug)}/${prox.id}</code><button class="btn sec" data-copiar="lk">Copiar link</button></div></div></div>`;
  }
  const cuerpo = `${bienvenida}${test}${susp}
    <div class="fila" style="justify-content:space-between;align-items:flex-end;margin-bottom:16px"><div>
      <h1>Hola, ${esc(p.nombre)}</h1><span class="muted">Tu página: <a href="/${esc(p.slug)}" target="_blank">${esc(baseUrl(req))}/${esc(p.slug)}</a></span></div>
      <a class="btn" href="/panel/eventos/nuevo">+ Nuevo evento</a></div>
    <div class="kpis">
      <div class="kpi c"><b>${r.proximos}</b><span>Eventos próximos</span></div>
      <div class="kpi g"><b>${r.entradas}</b><span>Entradas vendidas</span></div>
      <div class="kpi w"><b>${D.plata(r.neto)}</b><span>Recaudado (neto)</span></div>
      <div class="kpi r"><b>${mirando}</b><span>Mirando ahora</span></div>
    </div>
    ${listaPasos}${destacado}
    <h2 style="margin-top:0">Accesos rápidos</h2>
    <div class="mosaicos">
      ${accion('r', '/panel/eventos/nuevo', 'mas', 'Nuevo evento', 'Cargalo y publicalo')}
      ${accion('c', '/panel/eventos', 'cal', 'Mis eventos', 'Fechas, precios y transmisión')}
      ${accion('g', '/panel/ventas', 'billete', 'Ventas', 'Compras y reenvíos')}
      ${accion('c', '/panel/metricas', 'grafico', 'Métricas', 'Cómo te fue')}
      ${accion('r', '/panel/perfil', 'perfil', 'Mi página', 'Logo y datos')}
      ${accion('w', '/panel/mercadopago', 'wallet', 'Mercado Pago', 'Cobrá en tu cuenta', true)}
    </div>`;
  pagina(res, ctx, 'Inicio', cuerpo, 'inicio');
}

/* ------------------------------------------------------------------ eventos */
async function listaEventos(req, res, ctx) {
  const evs = db.prepare(`SELECT e.*, (SELECT COALESCE(SUM(cantidad),0) FROM ordenes o WHERE o.evento_id = e.id AND o.estado = 'aprobado') AS vendidas
      FROM eventos e WHERE e.productora_id = ? ORDER BY e.fecha IS NULL, e.fecha DESC`).all(ctx.p.id);
  const estados = await Promise.all(evs.map((e) => estadoEvento({ ...e, activo: 1 }).catch(() => ({ estado: 'error' }))));
  const filas = evs.map((e, i) => `<tr>
      <td><a href="/panel/eventos/${e.id}"><b>${esc(e.titulo)}</b></a><br><small>${D.fechaLinda(e.fecha) || 'Sin fecha'}</small></td>
      <td>${pillEv(e.estado)}${e.venta_activa ? '' : ' <span class="pill">Venta cerrada</span>'}</td>
      <td>${pillSeñal(estados[i].estado)}</td>
      <td>${Number(e.precio) > 0 ? D.plata(e.precio) : 'Gratis'}</td>
      <td>${e.vendidas}${e.cupo ? ' / ' + e.cupo : ''}</td>
      <td class="fila"><a class="btn sec chico" href="/panel/eventos/${e.id}">Editar</a><a class="btn sec chico" href="/panel/eventos/${e.id}/transmision">Transmisión</a></td></tr>`).join('');
  const cuerpo = `<div class="fila" style="justify-content:space-between"><div><h1>Eventos</h1><p class="sub">Todo lo que publicaste y tus borradores.</p></div>
    <a class="btn" href="/panel/eventos/nuevo">+ Crear evento</a></div>
    <div class="card tabla">${evs.length ? `<table><thead><tr><th>Evento</th><th>Visibilidad</th><th>Señal</th><th>Precio</th><th>Vendidas</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
      : '<p class="muted" style="margin:0">Todavía no creaste eventos. <a href="/panel/eventos/nuevo">Creá el primero</a>.</p>'}</div>`;
  pagina(res, ctx, 'Eventos', cuerpo, 'eventos');
}

function formEvento(res, ctx, ev, err = '') {
  const v = ev || { estado: 'borrador', venta_activa: 1, grabar: 1, repeticion_horas: 48 };
  const nuevo = !v.id;
  const cuerpo = `<p><a href="/panel/eventos">← Eventos</a></p><h1>${nuevo ? 'Crear evento' : 'Editar evento'}</h1>
    ${err ? `<div class="error">${esc(err)}</div>` : ''}
    <form method="post" class="card">
      <div class="dos"><div>
        <label>Título</label><input name="titulo" required maxlength="140" value="${esc(v.titulo || '')}" placeholder="Ej: Final del torneo">
        <label>Fecha y hora de inicio</label><input type="datetime-local" name="fecha" value="${esc(D.fechaAInput(v.fecha) || v.fecha_input || '')}">
        <label>Lugar (opcional)</label><input name="lugar" maxlength="120" value="${esc(v.lugar || '')}" placeholder="Ej: Club Estrella, Bahía Blanca">
        <div class="dos"><div><label>Precio por entrada ($)</label><input type="number" name="precio" min="0" step="1" value="${esc(v.precio != null ? v.precio : '')}" placeholder="0 = gratis"></div>
          <div><label>Cupo (vacío = sin límite)</label><input type="number" name="cupo" min="1" value="${esc(v.cupo || '')}"></div></div>
        <label>Precio en dólares para compras desde el exterior (PayPal, opcional)</label><input type="number" name="precio_usd" min="0" step="0.5" value="${esc(v.precio_usd || '')}" placeholder="Vacío = no se ofrece PayPal">
        <label>Descripción</label><textarea name="descripcion" maxlength="3000">${esc(v.descripcion || '')}</textarea>
      </div><div>
        <label>Imagen (se ve en la cartelera, ideal 16:9)</label>
        <img id="pv" src="${v.id && v.imagen ? `/img-evento/${v.id}?v=${v.imagen.length}` : ''}" ${v.imagen ? '' : 'hidden'} style="width:100%;border-radius:12px;margin-bottom:8px">
        <input type="file" accept="image/png,image/jpeg,image/webp" data-imagen data-vista="pv" data-lado="1280" data-max="350"><input type="hidden" name="imagen" value="">
        <label>Visibilidad</label><select name="estado">${Object.entries(ESTADOS_EV).map(([k, t]) => `<option value="${k}" ${v.estado === k ? 'selected' : ''}>${t[0]}</option>`).join('')}</select>
        <small>Borrador: solo lo ves vos. Publicado: aparece en tu página. Oculto: no aparece, pero se puede comprar con el link.</small>
        <label class="check" style="margin-top:14px"><input type="checkbox" name="venta_activa" value="1" ${v.venta_activa ? 'checked' : ''}> Venta abierta</label>
        <label class="check"><input type="checkbox" name="grabar" value="1" ${v.grabar ? 'checked' : ''}> Grabar para repetición</label>
        <label>Repetición disponible (horas después de terminar, 0 = sin límite)</label><input type="number" name="repeticion_horas" min="0" max="2160" value="${esc(v.repeticion_horas != null ? v.repeticion_horas : 48)}">
      </div></div>
      <div class="fila" style="margin-top:18px"><button class="btn">${nuevo ? 'Crear evento' : 'Guardar cambios'}</button>
        ${nuevo ? '' : `<a class="btn sec" href="/${esc(ctx.p.slug)}/${v.id}" target="_blank">Ver página</a><a class="btn sec" href="/panel/eventos/${v.id}/transmision">Transmisión</a>`}</div>
    </form>
    ${nuevo ? '' : `<form method="post" action="/panel/eventos/${v.id}/borrar" class="card fila" style="margin-top:14px">
      <label class="check" style="margin:0"><input type="checkbox" name="si" value="1" required> Sí, borrar este evento con sus ventas y su grabación</label><button class="btn peligro chico">Borrar evento</button></form>`}`;
  pagina(res, ctx, nuevo ? 'Crear evento' : 'Editar evento', cuerpo, 'eventos', err ? 422 : 200);
}

async function guardarEvento(req, res, ctx, ev) {
  const b = await leerCuerpo(req, 700 * 1024);
  const titulo = String(b.titulo || '').trim().slice(0, 140);
  const datos = {
    titulo,
    descripcion: String(b.descripcion || '').trim().slice(0, 3000),
    lugar: String(b.lugar || '').trim().slice(0, 120),
    fecha: D.fechaDeInput(b.fecha),
    precio: Math.max(0, Math.round(Number(b.precio) || 0)),
    precio_usd: Number(b.precio_usd) > 0 ? Math.round(Number(b.precio_usd) * 100) / 100 : null,
    cupo: parseInt(b.cupo, 10) > 0 ? parseInt(b.cupo, 10) : null,
    estado: ESTADOS_EV[b.estado] ? b.estado : 'borrador',
    venta_activa: b.venta_activa ? 1 : 0,
    grabar: b.grabar ? 1 : 0,
    repeticion_horas: Math.min(Math.max(parseInt(b.repeticion_horas, 10) || 0, 0), 2160),
  };
  if (!titulo) return formEvento(res, ctx, { ...(ev || {}), ...datos, fecha_input: b.fecha }, 'Poné un título.');
  if (b.imagen) {
    if (!D.imagenValida(b.imagen, 500 * 1024)) return formEvento(res, ctx, { ...(ev || {}), ...datos }, 'La imagen no es válida o es muy pesada.');
    datos.imagen = b.imagen;
  }
  if (!ev) {
    let s = {};
    if (config.cloudflareListo()) {
      try { s = await cf.crearEntrada(`${ctx.p.slug} · ${titulo}`, datos.grabar, datos.repeticion_horas); }
      catch (e) { return formEvento(res, ctx, { ...datos }, 'No se pudo crear la señal de transmisión: ' + e.message); }
    }
    const cols = { ...datos, productora_id: ctx.p.id, cf_uid: s.cf_uid || null, rtmps_url: s.rtmps_url || null, rtmps_key: cifrar(s.rtmps_key) || null,
      srt_url: s.srt_url || null, srt_id: s.srt_id || null, srt_pass: cifrar(s.srt_pass) || null, creado: new Date().toISOString() };
    const k = Object.keys(cols);
    const r = db.prepare(`INSERT INTO eventos (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`).run(...k.map((x) => cols[x]));
    return redirigir(res, `/panel/eventos/${r.lastInsertRowid}/transmision?nuevo=1`);
  }
  const k = Object.keys(datos);
  db.prepare(`UPDATE eventos SET ${k.map((x) => x + ' = ?').join(', ')} WHERE id = ? AND productora_id = ?`).run(...k.map((x) => datos[x]), ev.id, ctx.p.id);
  olvidar(ev.id);
  return redirigir(res, `/panel/eventos/${ev.id}?ok=1`);
}

async function transmision(req, res, ctx, ev, url) {
  const est = await estadoEvento({ ...ev, activo: 1 }).catch((e) => ({ estado: 'error', error: e.message }));
  const key = descifrar(ev.rtmps_key);
  const pass = descifrar(ev.srt_pass);
  const srt = ev.srt_url ? `${ev.srt_url}${ev.srt_url.includes('?') ? '&' : '?'}passphrase=${encodeURIComponent(pass || '')}&streamid=${encodeURIComponent(ev.srt_id || '')}` : '';
  const cuerpo = `<p><a href="/panel/eventos">← Eventos</a></p>
    <div class="fila" style="justify-content:space-between"><div><h1>${esc(ev.titulo)}</h1><p class="sub">${D.fechaLinda(ev.fecha) || 'Sin fecha'} · ${pillSeñal(est.estado)}</p></div>
    <div class="fila"><a class="btn" href="/panel/eventos/${ev.id}/prueba" target="_blank" rel="noopener">Ver reproductor de prueba</a><a class="btn sec" href="/panel/eventos/${ev.id}">Editar</a></div></div>
    ${url.searchParams.get('nuevo') ? `<div class="ok">Evento creado${ev.estado === 'borrador' ? ' como <b>borrador</b>: cuando esté listo, editalo y ponelo en <b>Publicado</b>' : ''}. Abajo tenés los datos para transmitir.</div>` : ''}
    ${!ev.cf_uid ? '<div class="aviso">Este evento no tiene señal de transmisión (la plataforma todavía no tiene configurado el servicio de video).</div>' : `
    <h2>Datos para vMix / OBS</h2>
    <div class="card">
      <p class="muted" style="margin-top:0">Son privados: con estos datos cualquiera podría transmitir en tu evento.</p>
      <b>RTMPS</b> <small>· vMix: Add Output → Custom RTMP Server · OBS: Servicio personalizado</small>
      <div class="dato" style="margin-top:8px"><code id="d1">${esc(ev.rtmps_url || '')}</code><button class="btn sec chico" data-copiar="d1">Copiar URL</button></div>
      <div class="dato"><code id="d2">${esc(key || '')}</code><button class="btn sec chico" data-copiar="d2">Copiar clave</button></div>
      <b style="display:block;margin-top:14px">SRT</b> <small>· más estable si la conexión es inestable</small>
      <div class="dato" style="margin-top:8px"><code id="d3">${esc(srt)}</code><button class="btn sec chico" data-copiar="d3">Copiar</button></div>
      <p class="muted" style="margin-bottom:0">Importante: la URL empieza con <b>rtmps://</b> (con S). Recomendado: 1080p o 720p, H.264, 4.000–6.000 kbps, keyframe cada 2 s, audio AAC 128 kbps.</p>
    </div>`}
    <h2>Link para compartir</h2>
    <div class="card"><div class="dato"><code id="d4">${esc(baseUrl(req))}/${esc(ctx.p.slug)}/${ev.id}</code><button class="btn sec chico" data-copiar="d4">Copiar</button></div>
    <small>Es la página de compra del evento. Compartila en redes y WhatsApp.</small></div>`;
  pagina(res, ctx, 'Transmisión', cuerpo, 'eventos');
}

function accesoDePrueba(req, res, ctx, ev) {
  const codigo = ('PRB' + ev.id).padEnd(8, 'X').slice(0, 12);
  db.prepare('INSERT OR IGNORE INTO accesos (evento_id, orden_id, codigo, creado) VALUES (?, NULL, ?, ?)').run(ev.id, codigo, new Date().toISOString());
  const a = db.prepare('SELECT id FROM accesos WHERE codigo = ?').get(codigo);
  return redirigir(res, `/ver/${firmar({ a: a.id, e: Math.floor(Date.now() / 1000) + 12 * 3600 })}`);
}

async function borrarEvento(req, res, ctx, ev) {
  const b = await leerCuerpo(req);
  if (!b.si) return formEvento(res, ctx, ev, 'Tildá la confirmación para borrar.');
  if (ev.cf_uid) {
    try { await cf.borrarEntrada(ev.cf_uid); } catch (e) { if (!/404/.test(e.message)) return formEvento(res, ctx, ev, 'No se pudo borrar la señal: ' + e.message); }
  }
  db.prepare('DELETE FROM eventos WHERE id = ? AND productora_id = ?').run(ev.id, ctx.p.id);
  olvidar(ev.id);
  return redirigir(res, '/panel/eventos');
}

/* ------------------------------------------------------------------ ventas */
async function ventasLista(req, res, ctx, url) {
  const evId = Number(url.searchParams.get('evento')) || null;
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
  let aviso = '';
  if (req.method === 'POST') {
    const b = await leerCuerpo(req);
    const o = db.prepare('SELECT * FROM ordenes WHERE id = ? AND productora_id = ?').get(Number(b.orden), ctx.p.id);
    if (o && b.accion === 'reenviar') aviso = (await ventas.enviarAccesos(o.id, baseUrl(req))) ? `<div class="ok">Reenviamos los accesos a ${esc(o.email)}.</div>` : '<div class="error">No se pudo enviar el mail.</div>';
    if (o && b.accion === 'revisar' && config.mpListo()) {
      try { const r = await ventas.revisarOrden(o.id, baseUrl(req)); aviso = `<div class="ok">Estado actual: ${esc((r && r.estado) || o.estado)}.</div>`; }
      catch (e) { aviso = `<div class="error">No se pudo consultar Mercado Pago: ${esc(e.message)}</div>`; }
    }
  }
  const evs = db.prepare('SELECT id, titulo FROM eventos WHERE productora_id = ? ORDER BY fecha DESC').all(ctx.p.id);
  const args = [ctx.p.id];
  let where = 'o.productora_id = ?';
  if (evId) { where += ' AND o.evento_id = ?'; args.push(evId); }
  if (q) { where += ' AND (o.email LIKE ? OR o.nombre LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  const ords = db.prepare(`SELECT o.*, e.titulo FROM ordenes o JOIN eventos e ON e.id = o.evento_id WHERE ${where} ORDER BY o.id DESC LIMIT 300`).all(...args);
  const base = baseUrl(req);
  const filas = ords.map((o) => {
    const links = ['aprobado', 'prueba'].includes(o.estado) ? ventas.accesosDe(o.id, base) : [];
    return `<tr><td>#${o.id}<br><small>${D.fechaLinda(o.creado, true)}</small></td>
      <td>${esc(o.email)}${o.nombre ? `<br><small>${esc(o.nombre)}</small>` : ''}${o.telefono ? `<br><small>${esc(o.telefono)}</small>` : ''}</td>
      <td>${esc(o.titulo)}</td><td>${o.cantidad}</td><td>${D.plata(o.monto)}</td><td>${pillOr(o.estado)}</td>
      <td>${links.length ? `<details><summary class="btn sec chico">Accesos</summary>${links.map((l) => `<div style="margin-top:6px"><code>${esc(l.codigo)}</code>${l.revocado ? ' <span class="pill rojo">anulado</span>' : ''}<br><small>${esc(l.url)}</small></div>`).join('')}</details>` : ''}
        <form method="post" class="fila" style="margin-top:6px"><input type="hidden" name="orden" value="${o.id}">
        ${links.length ? '<button class="btn sec chico" name="accion" value="reenviar">Reenviar mail</button>' : ''}
        ${o.estado === 'pendiente' ? '<button class="btn sec chico" name="accion" value="revisar">Revisar pago</button>' : ''}</form></td></tr>`;
  }).join('');
  const cuerpo = `<h1>Ventas</h1><p class="sub">Cada compra con sus accesos. Si alguien no recibió el mail, reenviáselo o pasale el link a mano.</p>${aviso}
    <form class="fila card" style="margin-bottom:14px"><select name="evento" style="max-width:320px"><option value="">Todos los eventos</option>${evs.map((e) => `<option value="${e.id}" ${evId === e.id ? 'selected' : ''}>${esc(e.titulo)}</option>`).join('')}</select>
      <input name="q" value="${esc(q)}" placeholder="Buscar por email o nombre" style="max-width:280px"><button class="btn sec">Filtrar</button></form>
    <div class="card tabla">${ords.length ? `<table><thead><tr><th>Compra</th><th>Comprador</th><th>Evento</th><th>Cant.</th><th>Monto</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="muted" style="margin:0">Todavía no hay ventas.</p>'}</div>`;
  pagina(res, ctx, 'Ventas', cuerpo, 'ventas');
}

/* ------------------------------------------------------------------ métricas */
function metricas(req, res, ctx) {
  const evs = db.prepare(`SELECT e.id, e.titulo, e.fecha, e.cupo,
      COALESCE(SUM(CASE WHEN o.estado = 'aprobado' THEN o.cantidad END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN o.estado = 'aprobado' THEN o.monto END), 0) AS bruto,
      COALESCE(SUM(CASE WHEN o.estado = 'aprobado' THEN o.comision END), 0) AS comision,
      (SELECT COUNT(*) FROM accesos a JOIN ordenes oo ON oo.id = a.orden_id WHERE a.evento_id = e.id AND oo.estado = 'aprobado' AND a.primera_vista IS NOT NULL) AS vieron
    FROM eventos e LEFT JOIN ordenes o ON o.evento_id = e.id WHERE e.productora_id = ? GROUP BY e.id ORDER BY e.fecha DESC`).all(ctx.p.id);
  const tot = evs.reduce((t, e) => ({ entradas: t.entradas + e.entradas, bruto: t.bruto + e.bruto, comision: t.comision + e.comision, vieron: t.vieron + e.vieron }), { entradas: 0, bruto: 0, comision: 0, vieron: 0 });
  const dias = db.prepare(`SELECT substr(creado, 1, 10) AS dia, SUM(cantidad) AS n FROM ordenes WHERE productora_id = ? AND estado = 'aprobado' AND creado >= ? GROUP BY dia ORDER BY dia`)
    .all(ctx.p.id, new Date(Date.now() - 30 * 864e5).toISOString());
  const max = Math.max(1, ...dias.map((d) => d.n));
  const barras = dias.length ? `<div style="display:flex;align-items:flex-end;gap:4px;height:140px;padding-top:10px">${dias.map((d) => `<div title="${esc(d.dia)}: ${d.n}" style="flex:1;min-width:6px;background:linear-gradient(var(--cyan),#1f7fa0);border-radius:4px 4px 0 0;height:${Math.max(4, Math.round(d.n / max * 130))}px"></div>`).join('')}</div>
    <div class="fila muted" style="justify-content:space-between;font-size:12px"><span>${esc(dias[0].dia)}</span><span>${esc(dias[dias.length - 1].dia)}</span></div>` : '<p class="muted">Todavía no hay ventas en los últimos 30 días.</p>';
  const filas = evs.map((e) => `<tr><td><b>${esc(e.titulo)}</b><br><small>${D.fechaLinda(e.fecha, true)}</small></td><td>${e.entradas}${e.cupo ? ` <small>(${Math.round(e.entradas / e.cupo * 100)}% del cupo)</small>` : ''}</td>
    <td>${D.plata(e.bruto)}</td><td>${D.plata(e.comision)}</td><td><b>${D.plata(e.bruto - e.comision)}</b></td><td>${e.vieron}${e.entradas ? ` <small>(${Math.round(e.vieron / e.entradas * 100)}%)</small>` : ''}</td></tr>`).join('');
  const cuerpo = `<h1>Métricas</h1><p class="sub">Solo cuentan las ventas aprobadas (no las de prueba).</p>
    <div class="kpis"><div class="kpi g"><b>${tot.entradas}</b><span>Entradas vendidas</span></div><div class="kpi c"><b>${D.plata(tot.bruto)}</b><span>Ventas brutas</span></div>
      <div class="kpi w"><b>${D.plata(tot.bruto - tot.comision)}</b><span>Neto para vos</span></div><div class="kpi r"><b>${tot.entradas ? Math.round(tot.vieron / tot.entradas * 100) : 0}%</b><span>De los compradores entraron a ver</span></div></div>
    <div class="card"><b>Entradas vendidas por día (últimos 30 días)</b>${barras}</div>
    <h2>Por evento</h2><div class="card tabla">${evs.length ? `<table><thead><tr><th>Evento</th><th>Entradas</th><th>Bruto</th><th>Comisión ${esc(config.marca)}</th><th>Neto</th><th>Entraron a ver</th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="muted" style="margin:0">Sin eventos todavía.</p>'}</div>`;
  pagina(res, ctx, 'Métricas', cuerpo, 'metricas');
}

/* ------------------------------------------------------------------ perfil */
async function perfil(req, res, ctx) {
  let aviso = '';
  let p = ctx.p;
  if (req.method === 'POST') {
    const b = await leerCuerpo(req, 500 * 1024);
    if (b.accion === 'clave') {
      const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(ctx.u.id);
      if (ctx.u.comoAdmin) aviso = '<div class="error">Como administrador no podés cambiar la clave de la productora desde acá.</div>';
      else if (!auth.claveOk(b.actual || '', u.clave)) aviso = '<div class="error">La clave actual no es correcta.</div>';
      else if (String(b.nueva || '').length < 8) aviso = '<div class="error">La clave nueva tiene que tener al menos 8 caracteres.</div>';
      else { db.prepare('UPDATE usuarios SET clave = ? WHERE id = ?').run(auth.hashClave(b.nueva), u.id); aviso = '<div class="ok">Clave cambiada.</div>'; }
    } else {
      let logo = p.logo;
      if (b.quitar_logo) logo = null;
      else if (b.logo) {
        if (!D.imagenValida(b.logo, 200 * 1024)) aviso = '<div class="error">El logo tiene que ser PNG, JPG o WEBP de hasta 200 KB.</div>';
        else logo = b.logo;
      }
      if (!aviso) {
        db.prepare('UPDATE productoras SET nombre = ?, descripcion = ?, whatsapp = ?, instagram = ?, logo = ? WHERE id = ?').run(
          String(b.nombre || p.nombre).trim().slice(0, 80) || p.nombre, String(b.descripcion || '').trim().slice(0, 500),
          String(b.whatsapp || '').replace(/[^0-9+]/g, '').slice(0, 20), String(b.instagram || '').replace(/[^\w.@]/g, '').slice(0, 40), logo, p.id);
        p = D.productora(p.id);
        ctx.p = p;
        aviso = '<div class="ok">Datos guardados.</div>';
      }
    }
  }
  const cuerpo = `<h1>Mi página</h1><p class="sub">Así se ve tu productora en <a href="/${esc(p.slug)}" target="_blank">${esc(baseUrl(req))}/${esc(p.slug)}</a></p>${aviso}
    <div class="dos" style="align-items:start">
    <form method="post" class="card"><h3>Datos de la productora</h3>
      <label>Nombre</label><input name="nombre" required maxlength="80" value="${esc(p.nombre)}">
      <label>Descripción corta</label><textarea name="descripcion" maxlength="500">${esc(p.descripcion || '')}</textarea>
      <div class="dos"><div><label>WhatsApp</label><input name="whatsapp" value="${esc(p.whatsapp || '')}" placeholder="5492914000000"></div><div><label>Instagram</label><input name="instagram" value="${esc(p.instagram || '')}" placeholder="@miproductora"></div></div>
      <label>Logo (PNG con fondo transparente queda mejor)</label>
      <img id="lg" src="${p.logo ? `/logo/${p.id}?v=${p.logo.length}` : ''}" ${p.logo ? '' : 'hidden'} style="max-height:60px;display:block;margin-bottom:8px;background:#fff1;padding:6px;border-radius:8px">
      <input type="file" accept="image/png,image/jpeg,image/webp" data-imagen data-vista="lg" data-lado="600" data-max="180" data-png="1"><input type="hidden" name="logo" value="">
      ${p.logo ? '<label class="check"><input type="checkbox" name="quitar_logo" value="1"> Quitar logo</label>' : ''}
      <button class="btn" style="margin-top:16px">Guardar</button></form>
    <form method="post" class="card"><h3>Cambiar clave</h3><input type="hidden" name="accion" value="clave">
      <label>Clave actual</label><input type="password" name="actual" required autocomplete="current-password">
      <label>Clave nueva</label><input type="password" name="nueva" required minlength="8" autocomplete="new-password">
      <button class="btn sec" style="margin-top:16px">Cambiar clave</button>
      <p class="muted" style="font-size:13px;margin-bottom:0">Dirección de tu página: <b>/${esc(p.slug)}</b>. Para cambiarla, escribinos.</p></form></div>`;
  pagina(res, ctx, 'Mi página', cuerpo, 'perfil');
}

function pronto(res, ctx, titulo, texto) {
  pagina(res, ctx, titulo, `<h1>${esc(titulo)}</h1><div class="card"><span class="pill cyan">PRÓXIMAMENTE</span><p>${texto}</p>
    <a class="btn sec" href="/panel">Volver</a></div>`, 'inicio');
}

/* ------------------------------------------------------------------ enrutador */
async function manejar(req, res, url, partes) {
  if (partes[0] !== 'panel') return false;
  const u = auth.usuarioActual(req);
  if (!u) return redirigir(res, '/ingresar'), true;
  if (!u.productora_id) return redirigir(res, '/admin'), true;
  const p = D.productora(u.productora_id);
  if (!p) return redirigir(res, '/salir'), true;
  const ctx = { u, p };
  const [, s1, s2, s3] = partes;
  if (!s1) return await inicio(req, res, ctx, url), true;
  if (s1 === 'eventos') {
    if (!s2) return await listaEventos(req, res, ctx), true;
    if (s2 === 'nuevo') return (req.method === 'POST' ? await guardarEvento(req, res, ctx, null) : formEvento(res, ctx, null)), true;
    const ev = /^\d+$/.test(s2) ? db.prepare('SELECT * FROM eventos WHERE id = ? AND productora_id = ?').get(Number(s2), p.id) : null;
    if (!ev) return redirigir(res, '/panel/eventos'), true;
    if (!s3) {
      if (req.method === 'POST') return await guardarEvento(req, res, ctx, ev), true;
      formEvento(res, ctx, ev, '');
      return true;
    }
    if (s3 === 'transmision') return await transmision(req, res, ctx, ev, url), true;
    if (s3 === 'prueba') return accesoDePrueba(req, res, ctx, ev), true;
    if (s3 === 'borrar' && req.method === 'POST') return await borrarEvento(req, res, ctx, ev), true;
    return redirigir(res, `/panel/eventos/${ev.id}`), true;
  }
  if (s1 === 'ventas') return await ventasLista(req, res, ctx, url), true;
  if (s1 === 'metricas') return metricas(req, res, ctx), true;
  if (s1 === 'perfil') return await perfil(req, res, ctx), true;
  if (s1 === 'mercadopago') return pronto(res, ctx, 'Asociar Mercado Pago', 'Muy pronto vas a poder conectar tu cuenta de Mercado Pago con un botón para que cada venta entre directo a tu cuenta. Mientras tanto, las ventas se cobran a través de la plataforma y te liquidamos lo recaudado.'), true;
  return redirigir(res, '/panel'), true;
}

module.exports = { manejar };
