/**
 * "Pasamanos" de video: entrega el video por nuestro dominio (ej. video.tudominio.com)
 * para que en el navegador no aparezca el proveedor de streaming.
 *
 * Variable del Worker: CUSTOMER_CODE = el código de cliente de Stream (sin "customer-").
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
};
const OCULTAR = ['server', 'cf-ray', 'cf-cache-status', 'set-cookie', 'report-to', 'nel', 'alt-svc', 'x-content-type-options', 'access-control-allow-origin', 'access-control-expose-headers', 'stream-media-id', 'cf-stream-media-id'];

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('No permitido', { status: 405 });

    const url = new URL(req.url);
    // La protección real la da el token firmado (el video exige token); acá solo descartamos ruido.
    if (url.pathname === '/' || url.pathname === '/favicon.ico' || url.pathname.length < 20) {
      return new Response('No encontrado', { status: 404 });
    }
    const origen = `customer-${env.CUSTOMER_CODE || 'il0jx6d1ltq7d0ad'}.cloudflarestream.com`;
    const arriba = new URL(url.pathname + url.search, `https://${origen}`);

    const h = new Headers();
    const range = req.headers.get('Range');
    if (range) h.set('Range', range);
    const r = await fetch(arriba, { method: req.method, headers: h, cf: { cacheEverything: false } });

    const headers = new Headers(r.headers);
    OCULTAR.forEach((k) => headers.delete(k));
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));

    const tipo = headers.get('content-type') || '';
    const esLista = tipo.includes('mpegurl') || url.pathname.endsWith('.m3u8');
    if (!esLista || req.method === 'HEAD') return new Response(r.body, { status: r.status, headers });

    // Las listas de reproducción pueden traer direcciones absolutas: las pasamos a nuestro dominio.
    const texto = (await r.text())
      .replace(/https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com/g, `https://${url.host}`)
      .replace(/https:\/\/videodelivery\.net/g, `https://${url.host}`);
    headers.delete('content-length');
    headers.set('Cache-Control', 'no-store');
    return new Response(texto, { status: r.status, headers });
  },
};
