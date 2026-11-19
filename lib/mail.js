'use strict';
const config = require('./config');
const { esc } = require('./util');

async function enviar(para, nombre, asunto, html, remitenteNombre) {
  if (!config.mailListo()) {
    console.warn('[mail] No configurado (BREVO_API_KEY / MAIL_FROM): no se mandó a', para);
    return false;
  }
  try {
    const r = await fetch(`${config.brevo.apiBase}/smtp/email`, {
      method: 'POST',
      headers: { 'api-key': config.brevo.key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: config.brevo.from, name: remitenteNombre || config.brevo.fromName },
        to: [{ email: para, name: nombre || para }],
        subject: asunto,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.error('[mail] Brevo', r.status, (await r.text()).slice(0, 300));
      return false;
    }
    console.log('[mail] enviado a', para);
    return true;
  } catch (e) {
    console.error('[mail] error', e.message);
    return false;
  }
}

/** Mail con los links de acceso de una compra. */
/** Cómo verlo en la tele (va en el mail de la compra). */
function bloqueTele() {
  const sitio = String(config.baseUrl || 'https://ticketgoplus.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const p = 'margin:0 0 10px;font-size:14px;line-height:1.45';
  return `<div style="background:#f6f7f9;border:1px solid #e3e3e3;border-radius:10px;padding:14px 16px;margin:0 0 16px">
    <h3 style="margin:0 0 10px;font-size:17px">📺 ¿Lo querés ver en la tele?</h3>
    <p style="${p}"><b>Smart TV (Samsung, LG, Philips y otras):</b> abrí el navegador de la tele y entrá a <b>${esc(sitio)}</b>. Vas a ver un <b>número de 4 cifras</b>. En tu celular abrí tu entrada, tocá el botón <b>📺</b> y escribí ese número. ¡Listo, arranca en la tele!</p>
    <p style="${p}"><b>Chromecast o Apple TV:</b> abrí tu entrada en el celular y tocá el ícono de <b>transmitir</b>.</p>
    <p style="${p}"><b>Android TV, Google TV o Fire TV:</b> también podés instalar la app <b>TicketGo</b>: bajá la app <b>Downloader</b> y escribí <b>${esc(sitio)}/app</b>.</p>
    <p style="margin:0;font-size:12px;color:#777">Al pasar la entrada a la tele, se corta en el celular (una pantalla a la vez).</p></div>`;
}

function accesos({ para, nombre, productora, evento, fecha, links }) {
  const filas = links.map((l, i) => `<tr>
      <td style="padding:10px 12px;border:1px solid #e3e3e3">Entrada ${i + 1}</td>
      <td style="padding:10px 12px;border:1px solid #e3e3e3;font-family:monospace;font-size:16px">${esc(l.codigo)}</td>
      <td style="padding:10px 12px;border:1px solid #e3e3e3"><a href="${esc(l.url)}" style="background:#ed383e;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:bold">Ver</a></td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222">
    <h2 style="margin:0 0 4px">¡Gracias por tu compra!</h2>
    <p style="margin:0 0 16px">Ya tenés tu acceso para <strong>${esc(evento)}</strong>${fecha ? ` (${esc(fecha)})` : ''}, de ${esc(productora)}.</p>
    <table style="border-collapse:collapse;margin:0 0 16px;width:100%"><tr style="background:#f4f4f4">
      <th style="padding:10px 12px;border:1px solid #e3e3e3;text-align:left">Entrada</th>
      <th style="padding:10px 12px;border:1px solid #e3e3e3;text-align:left">Código</th><th style="padding:10px 12px;border:1px solid #e3e3e3"></th></tr>${filas}</table>
    <p style="font-size:14px">Tocá <b>Ver</b> el día del evento. Cada entrada se puede ver en <b>una sola pantalla a la vez</b>.</p>
    ${bloqueTele()}
    <p style="font-size:12px;color:#888">Enviado por ${esc(config.marca)} para ${esc(productora)}.</p></div>`;
  return enviar(para, nombre, `Tu acceso para ${evento}`, html, productora);
}

module.exports = { enviar, accesos, bloqueTele };
