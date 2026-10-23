'use strict';
const crypto = require('node:crypto');
const path = require('node:path');

const env = (k, def = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : def);

const config = {
  port: parseInt(env('PORT', '8080'), 10),
  dataDir: env('DATA_DIR', path.join(__dirname, '..', 'data')),
  marca: env('BRAND_NAME', 'TicketGo'),
  baseUrl: env('BASE_URL', '').replace(/\/+$/, ''),
  adminEmail: env('ADMIN_EMAIL', '').toLowerCase(),
  adminPassword: env('ADMIN_PASSWORD'),
  secret: env('SECRET_KEY'),
  // Comisión general de la plataforma (cada productora puede tener la suya)
  comisionPct: parseFloat(env('COMISION_PCT', '8')) || 0,
  comisionFija: parseFloat(env('COMISION_FIJA', '0')) || 0,
  whatsapp: env('CONTACTO_WHATSAPP', '5492914254860'),
  moneda: '$',
  cf: {
    apiBase: env('CF_API_BASE', 'https://api.cloudflare.com/client/v4'),
    accountId: env('CF_ACCOUNT_ID'),
    token: env('CF_API_TOKEN'),
    customerCode: env('CF_CUSTOMER_CODE').replace(/^https?:\/\//, '').replace(/^customer-/, '').replace(/\.cloudflarestream\.com.*$/, ''),
  },
  videoHost: env('VIDEO_HOST', '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  hlsCdn: env('HLS_JS_URL', 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js'),
  mp: {
    apiBase: env('MP_API_BASE', 'https://api.mercadopago.com'),
    token: env('MP_ACCESS_TOKEN'),
  },
  paypal: {
    clientId: env('PAYPAL_CLIENT_ID'),
    secret: env('PAYPAL_SECRET'),
  },
  brevo: {
    apiBase: env('BREVO_API_BASE', 'https://api.brevo.com/v3'),
    key: env('BREVO_API_KEY'),
    from: env('MAIL_FROM'),
    fromName: env('MAIL_FROM_NAME', 'TicketGo'),
  },
};

if (!config.secret) {
  config.secret = crypto.randomBytes(32).toString('hex');
  console.warn('[aviso] Falta SECRET_KEY: las sesiones y los links se invalidan en cada reinicio.');
}

config.cloudflareListo = () => Boolean(config.cf.accountId && config.cf.token);
config.mpListo = () => Boolean(config.mp.token);
config.paypalListo = () => Boolean(config.paypal.clientId && config.paypal.secret);
config.mailListo = () => Boolean(config.brevo.key && config.brevo.from);

module.exports = config;
