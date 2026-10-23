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
    <p style="font-size:12px;color:#888">Enviado por ${esc(config.marca)} para ${esc(productora)}.</p></div>`;
  return enviar(para, nombre, `Tu acceso para ${evento}`, html, productora);
}

module.exports = { enviar, accesos };
