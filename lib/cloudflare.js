'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { ajuste } = require('./db');
const { b64url, cifrar, descifrar } = require('./util');

async function api(method, ruta, body) {
  if (!config.cloudflareListo()) throw new Error('Faltan CF_ACCOUNT_ID y CF_API_TOKEN.');
  const r = await fetch(`${config.cf.apiBase}/accounts/${config.cf.accountId}${ruta}`, {
    method,
    headers: { Authorization: 'Bearer ' + config.cf.token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.success) {
    const msg = `Cloudflare respondió ${r.status}${j && j.errors && j.errors[0] ? ': ' + j.errors[0].message : ''}`;
    console.error('[cloudflare]', method, ruta, msg);
    throw new Error(msg);
  }
  return j.result;
}

/** Crea la entrada en vivo de un evento (graba si se pide, siempre exige token para ver). */
async function crearEntrada(nombre, grabar, repeticionHoras) {
  const r = await api('POST', '/stream/live_inputs', {
    meta: { name: nombre },
    recording: { mode: grabar ? 'automatic' : 'off', requireSignedURLs: true, timeoutSeconds: 60 },
    deleteRecordingAfterDays: Math.max(30, Math.ceil((repeticionHoras || 0) / 24) + 30),
  });
  return {
    cf_uid: r.uid,
    rtmps_url: r.rtmps && r.rtmps.url,
    rtmps_key: r.rtmps && r.rtmps.streamKey,
    srt_url: r.srt && r.srt.url,
    srt_id: r.srt && r.srt.streamId,
    srt_pass: r.srt && r.srt.passphrase,
  };
}

async function estadoEntrada(uid) {
  const r = await api('GET', `/stream/live_inputs/${encodeURIComponent(uid)}`);
  return (r && r.status && r.status.current && r.status.current.state) || null; // connected | disconnected | null
}

async function grabaciones(uid) {
  const r = await api('GET', `/stream/live_inputs/${encodeURIComponent(uid)}/videos`);
  return (r || []).map((v) => {
    detectarCodigo(v);
    return {
      uid: v.uid,
      estado: v.status && v.status.state,
      enVivo: v.status && v.status.state === 'live-inprogress',
      duracion: v.duration,
      creado: v.created,
    };
  });
}

async function borrarEntrada(uid) {
  await api('DELETE', `/stream/live_inputs/${encodeURIComponent(uid)}`);
}

function detectarCodigo(video) {
  if (config.cf.customerCode || ajuste('cf_customer_code')) return;
  const hls = video && video.playback && video.playback.hls;
  const m = hls && /\/\/customer-([a-z0-9]+)\.cloudflarestream\.com/.exec(hls);
  if (m) ajuste('cf_customer_code', m[1]);
}

async function codigoCliente() {
  if (config.cf.customerCode) return config.cf.customerCode;
  const c = ajuste('cf_customer_code');
  if (c) return c;
  try {
    (await api('GET', '/stream?limit=1') || []).forEach(detectarCodigo);
  } catch { /* sin videos todavía */ }
  return ajuste('cf_customer_code');
}

/** Clave de firma de Stream: se crea una sola vez y queda guardada cifrada. */
async function claveFirma() {
  const id = ajuste('cf_sign_key_id');
  const pem = descifrar(ajuste('cf_sign_key_pem'));
  if (id && pem) return { id, pem };
  const r = await api('POST', '/stream/keys');
  const pemTxt = Buffer.from(r.pem, 'base64').toString('utf8');
  ajuste('cf_sign_key_pem', cifrar(pemTxt));
  ajuste('cf_sign_key_id', r.id);
  return { id: r.id, pem: pemTxt };
}

/** Token firmado por nosotros (no consume la API de Cloudflare). */
async function token(uid, horas = 6) {
  const { id, pem } = await claveFirma();
  const ahora = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: id }));
  const p = b64url(JSON.stringify({ sub: uid, kid: id, exp: ahora + Math.round(horas * 3600), nbf: ahora - 60 }));
  const firma = crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(pem);
  return h + '.' + p + '.' + b64url(firma);
}

/** URL HLS del video, por el dominio propio si está configurado. */
async function urlHls(uid, horas = 6) {
  const t = await token(uid, horas);
  if (config.videoHost) return `https://${config.videoHost}/${t}/manifest/video.m3u8`;
  const codigo = await codigoCliente();
  if (!codigo) throw new Error('No se conoce el código de cliente de Stream (CF_CUSTOMER_CODE).');
  return `https://customer-${codigo}.cloudflarestream.com/${t}/manifest/video.m3u8`;
}

module.exports = { api, crearEntrada, estadoEntrada, grabaciones, borrarEntrada, codigoCliente, token, urlHls };
