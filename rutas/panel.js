'use strict';
const config = require('../lib/config');
const { db, transaccion } = require('../lib/db');
const { esc, firmar, cifrar, descifrar } = require('../lib/util');
const { enviar, json, redirigir, leerCuerpo, baseUrl } = require('../lib/http');
const { panel, accion } = require('../lib/vistas');
const auth = require('../lib/auth');
const cf = require('../lib/cloudflare');
const { estadoEvento, olvidar } = require('../lib/estado');
const ventas = require('../lib/ventas');
const D = require('../lib/datos');

const ESTADOS_EV = { borrador: ['Borrador', ''], publicado: ['Publicado', 'verde'], oculto: ['Oculto (solo con link)', 'amarillo'] };
const pillEv = (e) => `<span class="pill ${ESTADOS_EV[e][1]}">${ESTADOS_EV[e][0]}</span>`;
const SEÑAL = { vivo: ['EN VIVO', 'rojo'], repeticion: ['Repetición', 'verde'], procesando: ['Preparando repetición', 'amarillo'], espera: ['Sin señal', ''], terminado: ['Finalizado', ''], cerrado: ['Pausado', ''], error: ['Sin datos', ''], grabado: ['Video listo', 'verde'], sinvideo: ['Falta el video', 'amarillo'] };
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
        <div class="fila"><a class="btn" href="/panel/eventos/${prox.id}/transmision">${prox.tipo === 'grabado' ? 'Video' : 'Transmitir'}</a><a class="btn sec" href="/panel/ventas?evento=${prox.id}">Ventas</a>
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
      ${accion('c', '/panel/paypal', 'mundo', 'PayPal', 'Vendé al exterior en dólares')}
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
      <td class="fila"><a class="btn sec chico" href="/panel/eventos/${e.id}">Editar</a><a class="btn sec chico" href="/panel/eventos/${e.id}/transmision">${e.tipo === 'grabado' ? 'Video' : 'Transmisión'}</a></td></tr>`).join('');
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
        <label>Tipo de evento</label>
        ${nuevo ? `<select name="tipo"><option value="vivo" ${v.tipo !== 'grabado' ? 'selected' : ''}>En vivo (transmisión desde vMix u OBS)</option><option value="grabado" ${v.tipo === 'grabado' ? 'selected' : ''}>Video grabado (subís el archivo)</option></select>`
          : `<p style="margin:0"><span class="pill ${v.tipo === 'grabado' ? 'cyan' : 'rojo'}">${v.tipo === 'grabado' ? 'Video grabado' : 'En vivo'}</span></p>`}
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
    ...(ev ? {} : { tipo: b.tipo === 'grabado' ? 'grabado' : 'vivo' }),
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
    if (config.cloudflareListo() && datos.tipo === 'vivo') {
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

/* ------------------------------------------------------------------ video grabado (partes / capítulos) */
const aSeg = (t) => {
  const p = String(t || '').trim().split(':').map((x) => parseInt(x, 10));
  if (!p.length || p.some((x) => !Number.isFinite(x) || x < 0)) return null;
  return p.reduce((a, x) => a * 60 + x, 0);
};
const aTiempo = (s) => { s = Number(s) || 0; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const partesDe = (evId) => db.prepare('SELECT * FROM partes WHERE evento_id = ? ORDER BY orden, id').all(evId);
function renumerar(evId) { partesDe(evId).forEach((p, i) => db.prepare('UPDATE partes SET orden = ? WHERE id = ?').run(i + 1, p.id)); }

async function paginaVideo(req, res, ctx, ev, url, aviso = '') {
  const est = await estadoEvento({ ...ev, activo: 1 }).catch((e) => ({ estado: 'error', error: e.message, videos: {} }));
  const vids = est.videos || {};
  const partes = partesDe(ev.id);
  const videosSubidos = [...new Map(partes.filter((p) => p.uid).map((p) => [p.uid, p])).values()];
  const estadoVid = (p) => {
    if (!p.uid) return '<span class="pill amarillo">Sin video</span>';
    const v = vids[p.uid];
    if (!v) return '<span class="pill">…</span>';
    if (v.listo) return `<span class="pill verde">Listo${v.duracion ? ' · ' + aTiempo(Math.round(v.duracion)) : ''}</span>`;
    if (v.estado === 'error') return '<span class="pill rojo">Error</span>';
    if (v.estado === 'pendingupload') return '<span class="pill amarillo">Subida incompleta</span>';
    return `<span class="pill amarillo">Procesando${v.progreso ? ' ' + Math.round(v.progreso) + '%' : ''}</span>`;
  };
  const filas = partes.map((p, i) => `<tr>
    <td style="width:34px"><b>${i + 1}</b></td>
    <td><form method="post" class="fila" style="flex-wrap:nowrap"><input type="hidden" name="accion" value="renombrar"><input type="hidden" name="pid" value="${p.id}">
      <input name="titulo" value="${esc(p.titulo)}" maxlength="80" style="min-width:140px"><button class="btn sec chico">Guardar</button></form>
      ${p.inicio != null && p.inicio !== '' ? `<small>Capítulo: empieza en <b>${aTiempo(p.inicio)}</b></small>` : ''}</td>
    <td>${estadoVid(p)}<div id="prog${p.id}" class="muted" style="font-size:12px;margin-top:4px"></div>
      ${p.inicio == null ? `<label class="btn sec chico" style="margin:6px 0 0;color:#fff">${p.uid ? 'Reemplazar video' : 'Subir video'}<input type="file" data-parte="${p.id}" accept="video/*,.mp4,.mov,.mkv,.webm" hidden></label>` : ''}</td>
    <td><form method="post" class="fila"><input type="hidden" name="pid" value="${p.id}">
      <button class="btn sec chico" name="accion" value="subir" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
      <button class="btn sec chico" name="accion" value="bajar" ${i === partes.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
      <button class="btn peligro chico" name="accion" value="borrar" title="Borrar">✕</button></form></td></tr>`).join('');
  const cuerpo = `<p><a href="/panel/eventos">← Eventos</a></p>
    <div class="fila" style="justify-content:space-between"><div><h1>${esc(ev.titulo)}</h1><p class="sub"><span class="pill cyan">Video grabado</span> ${pillSeñal(est.estado)}</p></div>
    <div class="fila">${est.estado === 'grabado' ? `<a class="btn" href="/panel/eventos/${ev.id}/prueba" target="_blank" rel="noopener">Ver como comprador</a>` : ''}<a class="btn sec" href="/panel/eventos/${ev.id}">Editar</a></div></div>
    ${url.searchParams.get('nuevo') ? `<div class="ok">Evento creado${ev.estado === 'borrador' ? ' como <b>borrador</b>' : ''}. Ahora agregá las partes y subí los videos.</div>` : ''}${aviso}
    ${!config.cloudflareListo() ? '<div class="aviso">La plataforma todavía no tiene configurado el servicio de video.</div>' : ''}
    ${est.estado === 'procesando' ? '<script>setTimeout(function(){if(!window.subiendo)location.reload()},20000)</script>' : ''}
    <h2>Partes del curso / video</h2>
    <p class="muted" style="margin-top:-6px">El comprador ve un botón por cada parte y elige cuál mirar. Si hay una sola, se reproduce directo.</p>
    <div class="card tabla">${partes.length ? `<table><thead><tr><th>#</th><th>Título</th><th>Video</th><th>Orden</th></tr></thead><tbody>${filas}</tbody></table>`
      : '<p class="muted" style="margin:0">Todavía no hay partes. Agregá la primera abajo.</p>'}</div>
    <div class="dos" style="margin-top:14px;align-items:start">
      <form method="post" class="card"><h3>+ Agregar parte</h3><p class="muted" style="margin:4px 0 0;font-size:14px">Una parte = un archivo de video (ej. "Clase 1"). Después la subís desde la tabla.</p>
        <input type="hidden" name="accion" value="nueva"><label>Título</label><input name="titulo" maxlength="80" placeholder="Clase ${partes.length + 1}">
        <button class="btn" style="margin-top:12px">Agregar parte</button></form>
      <form method="post" class="card"><h3>+ Agregar capítulo</h3><p class="muted" style="margin:4px 0 0;font-size:14px">Si subiste un solo video largo, marcá dónde empieza cada parte. No ocupa espacio extra.</p>
        <input type="hidden" name="accion" value="capitulo">
        ${videosSubidos.length ? `<label>Video</label><select name="uid">${videosSubidos.map((p) => `<option value="${esc(p.uid)}">${esc(p.titulo)}</option>`).join('')}</select>
        <div class="dos"><div><label>Título</label><input name="titulo" maxlength="80" placeholder="Clase 2"></div><div><label>Empieza en (h:mm:ss o mm:ss)</label><input name="inicio" placeholder="42:10" required></div></div>
        <button class="btn sec" style="margin-top:12px">Agregar capítulo</button>` : '<p class="muted">Primero subí al menos un video.</p>'}</form>
    </div>
    <p class="muted" style="font-size:13px">Formatos: MP4 (recomendado), MOV, MKV. Hasta 6 horas por video. Archivos de varios GB sin problema: si se corta, volvé a elegir el mismo archivo y sigue desde donde quedó. No cierres la página mientras sube.</p>
    <h2>Link para compartir</h2>
    <div class="card"><div class="dato"><code id="d4">${esc(baseUrl(req))}/${esc(ctx.p.slug)}/${ev.id}</code><button class="btn sec chico" data-copiar="d4">Copiar</button></div></div>
    <script src="https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js"></script>
    <script>(function(){
      function mb(n){return (n/1048576).toFixed(0)+' MB'}
      document.querySelectorAll('input[data-parte]').forEach(function(inp){inp.onchange=function(){var f=inp.files[0];if(!f)return;
        var pid=inp.getAttribute('data-parte'),out=document.getElementById('prog'+pid);
        if(!window.tus){alert('No se pudo cargar el sistema de subida. Recargá la página.');return}
        window.subiendo=true;var clave='tg-subida-'+pid+'-'+f.name+'-'+f.size,g=null;try{g=JSON.parse(localStorage.getItem(clave)||'null')}catch(e){}
        out.innerHTML='<div class="barrita" style="height:8px;margin:4px 0"><i style="width:0%"></i></div><span>Preparando…</span>';var bar=out.querySelector('i'),txt=out.querySelector('span');
        var pedir=g?Promise.resolve(g):fetch('/panel/eventos/${ev.id}/partes/'+pid+'/subida',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tamano:f.size,nombre:f.name})})
          .then(function(r){return r.json()}).then(function(d){if(d.error)throw new Error(d.error);try{localStorage.setItem(clave,JSON.stringify(d))}catch(e){}return d});
        pedir.then(function(d){new tus.Upload(f,{uploadUrl:d.url,chunkSize:52428800,retryDelays:[0,3000,6000,12000,30000],
          onProgress:function(a,t){var p=t?a/t*100:0;bar.style.width=p.toFixed(1)+'%';txt.textContent='Subiendo '+p.toFixed(0)+'% ('+mb(a)+' de '+mb(t)+')'},
          onError:function(){txt.textContent='Se cortó. Volvé a elegir el mismo archivo para seguir.';window.subiendo=false},
          onSuccess:function(){try{localStorage.removeItem(clave)}catch(e){}bar.style.width='100%';txt.textContent='¡Subido! Preparando…';
            fetch('/panel/eventos/${ev.id}/partes/'+pid+'/lista',{method:'POST'}).finally(function(){window.subiendo=false;if(!document.querySelector('.barrita i[style*="%"]:not([style*="100%"])'))setTimeout(function(){location.reload()},2500)})}}).start()})
          .catch(function(e){txt.textContent='No se pudo iniciar: '+e.message;window.subiendo=false})}});
    })()</script>`;
  pagina(res, ctx, 'Video', cuerpo, 'eventos');
}

async function accionPartes(req, res, ctx, ev, url) {
  const b = await leerCuerpo(req);
  const p = b.pid ? db.prepare('SELECT * FROM partes WHERE id = ? AND evento_id = ?').get(Number(b.pid), ev.id) : null;
  const titulo = String(b.titulo || '').trim().slice(0, 80);
  let aviso = '';
  if (b.accion === 'nueva') {
    const n = partesDe(ev.id).length + 1;
    db.prepare('INSERT INTO partes (evento_id, titulo, orden, creado) VALUES (?, ?, ?, ?)').run(ev.id, titulo || `Parte ${n}`, n, new Date().toISOString());
    aviso = '<div class="ok">Parte agregada. Ahora tocá <b>Subir video</b> en su fila.</div>';
  } else if (b.accion === 'capitulo') {
    const ini = aSeg(b.inicio);
    const existe = db.prepare('SELECT 1 FROM partes WHERE evento_id = ? AND uid = ?').get(ev.id, String(b.uid || ''));
    if (!existe || ini == null) aviso = '<div class="error">Revisá el video y el tiempo de inicio (ej. 42:10 o 1:05:30).</div>';
    else {
      const n = partesDe(ev.id).length + 1;
      db.prepare('INSERT INTO partes (evento_id, titulo, orden, uid, inicio, creado) VALUES (?, ?, ?, ?, ?, ?)').run(ev.id, titulo || `Parte ${n}`, n, b.uid, ini, new Date().toISOString());
      aviso = '<div class="ok">Capítulo agregado.</div>';
    }
  } else if (p && b.accion === 'renombrar' && titulo) {
    db.prepare('UPDATE partes SET titulo = ? WHERE id = ?').run(titulo, p.id);
  } else if (p && (b.accion === 'subir' || b.accion === 'bajar')) {
    const lista = partesDe(ev.id);
    const i = lista.findIndex((x) => x.id === p.id);
    const j = b.accion === 'subir' ? i - 1 : i + 1;
    if (j >= 0 && j < lista.length) { [lista[i], lista[j]] = [lista[j], lista[i]]; lista.forEach((x, k) => db.prepare('UPDATE partes SET orden = ? WHERE id = ?').run(k + 1, x.id)); }
  } else if (p && b.accion === 'borrar') {
    db.prepare('DELETE FROM partes WHERE id = ?').run(p.id);
    if (p.uid && p.inicio == null) {
      const usa = db.prepare('SELECT COUNT(*) AS n FROM partes WHERE uid = ?').get(p.uid).n;
      if (!usa) { try { await cf.borrarVideo(p.uid); } catch { /* ya no existe */ } }
      else db.prepare('DELETE FROM partes WHERE uid = ? AND evento_id = ? AND inicio IS NOT NULL AND NOT EXISTS (SELECT 1 FROM partes q WHERE q.uid = partes.uid AND q.inicio IS NULL)').run(p.uid, ev.id);
    }
    renumerar(ev.id);
    aviso = '<div class="ok">Parte borrada.</div>';
  }
  olvidar(ev.id);
  return paginaVideo(req, res, ctx, ev, url, aviso);
}

async function subidaParte(req, res, ctx, ev, pid, lista) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  const p = db.prepare('SELECT * FROM partes WHERE id = ? AND evento_id = ?').get(Number(pid), ev.id);
  if (!p) return json(res, 404, { error: 'Parte inexistente' });
  if (lista) { olvidar(ev.id); return json(res, 200, { ok: true }); }
  const b = await leerCuerpo(req, 4096);
  const tamano = Number(b.tamano);
  if (!(tamano > 0) || tamano > 60 * 1024 ** 3) return json(res, 422, { error: 'Tamaño de archivo inválido (máximo 60 GB).' });
  try {
    const s = await cf.crearSubida(tamano, `${ctx.p.slug} · ${ev.titulo} · ${p.titulo}`);
    const viejo = p.uid;
    db.prepare('UPDATE partes SET uid = ? WHERE id = ?').run(s.uid, p.id);
    // Los capítulos que apuntaban al video viejo pasan al nuevo
    if (viejo) {
      db.prepare('UPDATE partes SET uid = ? WHERE evento_id = ? AND uid = ? AND inicio IS NOT NULL').run(s.uid, ev.id, viejo);
      if (!db.prepare('SELECT COUNT(*) AS n FROM partes WHERE uid = ?').get(viejo).n) { try { await cf.borrarVideo(viejo); } catch { /* ya no existe */ } }
    }
    olvidar(ev.id);
    return json(res, 200, { url: s.url, uid: s.uid });
  } catch (e) {
    return json(res, 502, { error: e.message });
  }
}

async function transmision(req, res, ctx, ev, url) {
  if (ev.tipo === 'grabado') return paginaVideo(req, res, ctx, ev, url);
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
  for (const u of new Set([ev.video_uid, ...partesDe(ev.id).map((p) => p.uid)].filter(Boolean))) { try { await cf.borrarVideo(u); } catch { /* ya no existe */ } }
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

function paypal(req, res, ctx) {
  const evs = db.prepare('SELECT id, titulo, fecha, precio, precio_usd FROM eventos WHERE productora_id = ? AND (fecha IS NULL OR fecha >= ?) ORDER BY fecha').all(ctx.p.id, new Date(Date.now() - 12 * 3600e3).toISOString());
  const filas = evs.map((e) => `<tr><td><b>${esc(e.titulo)}</b><br><small>${D.fechaLinda(e.fecha, true) || 'Sin fecha'}</small></td><td>${Number(e.precio) > 0 ? D.plata(e.precio) : 'Gratis'}</td>
    <td>${Number(e.precio_usd) > 0 ? `<span class="pill cyan">USD ${esc(e.precio_usd)}</span>` : '<span class="muted">No ofrece PayPal</span>'}</td><td><a class="btn sec chico" href="/panel/eventos/${e.id}">${Number(e.precio_usd) > 0 ? 'Cambiar' : 'Agregar precio USD'}</a></td></tr>`).join('');
  const cuerpo = `<h1>PayPal · ventas al exterior</h1><p class="sub">Para que te compren desde otros países, en dólares, con tarjeta internacional o saldo PayPal.</p>
    <div class="dos" style="align-items:start">
      <div class="card"><h3>Cómo funciona</h3><ol class="muted" style="padding-left:20px;margin:8px 0 0">
        <li>En cada evento cargás un <b style="color:#fff">precio en dólares</b>.</li>
        <li>En la página del evento aparece el botón amarillo <b style="color:#fff">Pagar con PayPal</b> para los que están fuera de Argentina.</li>
        <li>${config.paypalListo() ? 'El comprador paga con PayPal y recibe su acceso al instante, como con Mercado Pago.' : 'El botón ya se muestra en tus eventos. El cobro con PayPal se habilita muy pronto.'}</li></ol></div>
      <div class="card"><h3>Estado</h3>${config.paypalListo() ? '<p><span class="pill verde">PayPal conectado</span></p>' : '<p><span class="pill amarillo">Próximamente</span></p><p class="muted" style="margin:0">Cargá el precio en dólares en tus eventos y el botón queda visible para los compradores del exterior.</p>'}</div>
    </div>
    <h2>Tus próximos eventos</h2><div class="card tabla">${evs.length ? `<table><thead><tr><th>Evento</th><th>Precio en pesos</th><th>PayPal</th><th></th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="muted" style="margin:0">No tenés eventos próximos.</p>'}</div>`;
  pagina(res, ctx, 'PayPal', cuerpo, 'inicio');
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
    if (s3 === 'transmision' && req.method === 'POST' && ev.tipo === 'grabado') return await accionPartes(req, res, ctx, ev, url), true;
    if (s3 === 'transmision') return await transmision(req, res, ctx, ev, url), true;
    if (s3 === 'partes' && !partes[4] && req.method === 'POST') return await accionPartes(req, res, ctx, ev, url), true;
    if (s3 === 'partes' && /^\d+$/.test(partes[4] || '')) return await subidaParte(req, res, ctx, ev, partes[4], partes[5] === 'lista'), true;
    if (s3 === 'prueba') return accesoDePrueba(req, res, ctx, ev), true;
    if (s3 === 'borrar' && req.method === 'POST') return await borrarEvento(req, res, ctx, ev), true;
    return redirigir(res, `/panel/eventos/${ev.id}`), true;
  }
  if (s1 === 'ventas') return await ventasLista(req, res, ctx, url), true;
  if (s1 === 'metricas') return metricas(req, res, ctx), true;
  if (s1 === 'perfil') return await perfil(req, res, ctx), true;
  if (s1 === 'paypal') return paypal(req, res, ctx), true;
  if (s1 === 'mercadopago') return pronto(res, ctx, 'Asociar Mercado Pago', 'Muy pronto vas a poder conectar tu cuenta de Mercado Pago con un botón para que cada venta entre directo a tu cuenta. Mientras tanto, las ventas se cobran a través de la plataforma y te liquidamos lo recaudado.'), true;
  return redirigir(res, '/panel'), true;
}

module.exports = { manejar };
