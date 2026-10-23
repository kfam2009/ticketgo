'use strict';
const config = require('./config');
const logoAnimado = require('./logo-animado');
const { esc } = require('./util');

const FUENTES = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

const CSS = `
:root{--bg:#0c0d11;--bg2:#121419;--card:#171a21;--card2:#1e212a;--line:#2a2e38;--line2:#3a3f4b;--txt:#f2f3f5;--muted:#a3a7b0;
--red:#ed383e;--red2:#c9252b;--cyan:#4cc9f0;--green:#3ccf7e;--warn:#f2b632;--violet:#8b5cf6;--pink:#ec4899}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--txt);font:15px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--cyan)}
h1,h2,h3,.cond{font-family:"Barlow Condensed",Inter,sans-serif;letter-spacing:.01em}
h1{font-size:34px;line-height:1.05;margin:0 0 6px;font-weight:800}h2{font-size:24px;margin:28px 0 12px;font-weight:700}h3{font-size:19px;margin:0 0 4px;font-weight:700}
.franja{height:3px;background:linear-gradient(90deg,var(--red) 0 33.3%,var(--cyan) 33.3% 66.6%,var(--green) 66.6%)}
.top{background:rgba(12,13,17,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.top .in{max-width:1120px;margin:0 auto;padding:10px 16px;display:flex;gap:14px;align-items:center;min-height:60px}
.top .logo img{height:34px;display:block}.top .logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;min-width:0}
.top .logo .pn{font:700 18px "Barlow Condensed",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top nav{margin-left:auto;display:flex;gap:4px;align-items:center}
.top nav a{color:var(--muted);text-decoration:none;padding:7px 11px;border-radius:9px;font-weight:600;font-size:14px;white-space:nowrap}
.top nav a:hover,.top nav a.on{color:#fff;background:var(--card2)}
main{max-width:1120px;margin:0 auto;padding:26px 16px 90px}
.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
.card+.card{margin-top:14px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:18px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;border-top:3px solid var(--line2)}
.kpi b{display:block;font:800 30px/1.1 "Barlow Condensed",sans-serif}.kpi span{color:var(--muted);font-size:13px}
.kpi.r{border-top-color:var(--red)}.kpi.c{border-top-color:var(--cyan)}.kpi.g{border-top-color:var(--green)}.kpi.w{border-top-color:var(--warn)}
.btn{display:inline-flex;align-items:center;white-space:nowrap;justify-content:center;gap:8px;background:var(--red);color:#fff;border:0;border-radius:11px;padding:11px 18px;font:700 15px Inter,sans-serif;cursor:pointer;text-decoration:none}
.btn:hover{background:var(--red2);color:#fff}.btn.sec{background:var(--card2);border:1px solid var(--line2)}.btn.sec:hover{background:var(--line)}
.btn.verde{background:var(--green);color:#06210f}.btn.peligro{background:transparent;border:1px solid #6b2a2d;color:#ff8a87}.btn.chico{padding:6px 11px;font-size:13px;border-radius:9px}
.btn.ancho{width:100%}
label{display:block;font-weight:600;font-size:13px;color:var(--muted);margin:14px 0 6px}
input,select,textarea{width:100%;background:var(--bg2);color:var(--txt);border:1px solid var(--line2);border-radius:11px;padding:11px 13px;font:15px Inter,sans-serif}
textarea{min-height:90px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:2px solid var(--cyan);border-color:transparent}
.check{display:flex;gap:9px;align-items:center;color:var(--txt);font-weight:500}.check input{width:auto}
.fila{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.dos{display:grid;gap:14px;grid-template-columns:1fr 1fr}@media(max-width:700px){.dos{grid-template-columns:1fr}}
.pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:var(--card2);color:var(--muted);border:1px solid var(--line2);white-space:nowrap}
.pill.rojo{background:rgba(237,56,62,.14);color:#ff7d81;border-color:rgba(237,56,62,.45)}
.pill.verde{background:rgba(60,207,126,.12);color:#6ee3a3;border-color:rgba(60,207,126,.4)}
.pill.amarillo{background:rgba(242,182,50,.12);color:#f7c95e;border-color:rgba(242,182,50,.4)}
.pill.cyan{background:rgba(76,201,240,.12);color:#83dcf7;border-color:rgba(76,201,240,.4)}
.aviso,.error,.ok{padding:12px 14px;border-radius:11px;margin:0 0 16px;border:1px solid}
.aviso{background:rgba(242,182,50,.08);border-color:rgba(242,182,50,.35)}
.error{background:rgba(237,56,62,.09);border-color:rgba(237,56,62,.4);color:#ffb3b5}
.ok{background:rgba(60,207,126,.08);border-color:rgba(60,207,126,.35)}
.muted{color:var(--muted)}small{color:var(--muted)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:13px}.tabla{overflow-x:auto}
.dato{display:flex;gap:8px;align-items:center;margin-bottom:8px}.dato code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;background:var(--bg2);border:1px solid var(--line);border-radius:9px;padding:9px 11px;font-size:13px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
/* Mosaicos del panel */
.mosaicos{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
.mos{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;text-decoration:none;color:var(--txt);display:flex;flex-direction:column;gap:10px;position:relative;transition:border-color .15s,transform .15s}
.mos:hover{border-color:var(--c,var(--line2));transform:translateY(-2px)}
.mos .ic{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--c);color:var(--c)}
.mos .ic svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.mos b{font:700 19px/1.1 "Barlow Condensed",sans-serif}.mos span{color:var(--muted);font-size:13px;line-height:1.35}
.mos.r{--c:var(--red)}.mos.c{--c:var(--cyan)}.mos.g{--c:var(--green)}.mos.w{--c:var(--warn)}
.mos.pronto{opacity:.5}.mos .tag{position:absolute;top:12px;right:12px;font-size:10px;font-weight:800;letter-spacing:.06em;color:var(--muted)}
.destacado{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:center;padding:14px}
.destacado .img{aspect-ratio:16/9;border-radius:12px;background:#1d2029 center/cover no-repeat}
@media(max-width:640px){.destacado{grid-template-columns:1fr}}
.pasos{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.pasos li{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:11px;background:var(--bg2);border:1px solid var(--line)}
.pasos li .n{width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:2px solid var(--line2);color:var(--muted)}
.pasos li.hecho .n{background:var(--green);border-color:var(--green);color:#06210f}.pasos li.hecho span{color:var(--muted);text-decoration:line-through}
.pasos li a{margin-left:auto}
.barrita{height:6px;border-radius:99px;background:var(--bg2);overflow:hidden;margin:6px 0 14px}.barrita i{display:block;height:100%;background:linear-gradient(90deg,var(--red),var(--cyan),var(--green))}
.pp{margin-top:18px}.pp-sep{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;margin-bottom:10px}
.pp-sep::before,.pp-sep::after{content:"";flex:1;height:1px;background:var(--line)}
.pp-btn{width:100%;background:#ffc439;color:#111;border:0;border-radius:11px;padding:12px;font:600 16px Inter,sans-serif;cursor:pointer}
.pp-btn b{color:#003087;font-weight:800;font-style:italic}.pp-btn i{color:#0070e0;font-weight:800}.pp-btn:hover{filter:brightness(.96)}
.pp-info{background:var(--bg2);border:1px solid var(--line2);border-radius:12px;padding:14px}.pp-info p{color:var(--muted);font-size:14px;margin:6px 0 12px}
/* Barra inferior en el celular */
.barra{display:none}
@media(max-width:760px){
  .top nav.panel{display:none}
  .barra{display:flex;position:fixed;bottom:0;left:0;right:0;background:#0f1116;border-top:1px solid var(--line);z-index:30;padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
  .barra a{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--muted);text-decoration:none;font-size:11px;font-weight:600;padding:4px 0}
  .barra a.on{color:var(--red)}.barra svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:28px}
}
/* Público */
.hero{padding:40px 0 18px}.hero h1{font-size:48px}@media(max-width:600px){.hero h1{font-size:36px}}
.hero .tag{display:inline-block;color:var(--cyan);font:700 13px Inter;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px}
.ev{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:var(--txt)}
.ev:hover{border-color:var(--line2)}
.ev .img{aspect-ratio:16/9;background:#1a1d24 center/cover no-repeat;position:relative}
.ev .img .pill{position:absolute;top:10px;left:10px}
.ev .cuerpo{padding:14px 16px;display:flex;flex-direction:column;gap:4px;flex:1}
.ev .prod{color:var(--muted);font-size:13px;font-weight:600}
.ev .precio{margin-top:auto;padding-top:8px;font:800 22px "Barlow Condensed",sans-serif}
.prodcab{display:flex;gap:18px;align-items:center;padding:30px 0 10px}
.prodcab img{max-height:72px;max-width:200px;object-fit:contain}
.pie{border-top:1px solid var(--line);color:var(--muted);font-size:13px;text-align:center;padding:22px 16px 40px}
.pie img{height:22px;vertical-align:middle;margin-left:6px}
.modotest{background:repeating-linear-gradient(45deg,rgba(242,182,50,.14) 0 12px,rgba(242,182,50,.06) 12px 24px);border:1px solid rgba(242,182,50,.45);color:#f7d589;border-radius:12px;padding:10px 14px;font-weight:600;margin-bottom:16px}
`;

const ICONOS = {
  mas: '<path d="M12 5v14M5 12h14"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tv: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/>',
  billete: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  grafico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
  gente: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  casa: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  mas2: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24">${ICONOS[n] || ''}</svg>`;

const SCRIPT = `<script>
document.addEventListener('click',function(e){var b=e.target.closest('[data-copiar]');if(!b)return;
var t=document.getElementById(b.getAttribute('data-copiar'));if(!t)return;
navigator.clipboard.writeText(t.textContent.trim()).then(function(){var o=b.textContent;b.textContent='Copiado';setTimeout(function(){b.textContent=o},1400)})});
document.addEventListener('change',function(e){var f=e.target;if(!f.hasAttribute('data-imagen')||!f.files[0])return;
var max=Number(f.getAttribute('data-max')||300)*1024;
var r=new FileReader();r.onload=function(){var img=new Image();img.onload=function(){
 var lado=Number(f.getAttribute('data-lado')||1280),w=img.width,h=img.height,k=Math.min(1,lado/Math.max(w,h));
 var c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
 var tipo=f.getAttribute('data-png')?'image/png':'image/jpeg',q=.85,u=c.toDataURL(tipo,q);
 while(u.length>max*1.37&&q>.4){q-=.1;u=c.toDataURL('image/jpeg',q)}
 if(u.length>max*1.37){alert('La imagen es muy pesada. Probá con una más chica.');f.value='';return}
 f.nextElementSibling.value=u;var pv=document.getElementById(f.getAttribute('data-vista'));if(pv){pv.src=u;pv.hidden=false}};img.src=r.result};
r.readAsDataURL(f.files[0])});
</script>`;

function cabeza(titulo, descripcion) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>${descripcion ? `<meta name="description" content="${esc(descripcion)}">` : ''}
<link rel="icon" href="/img/icono.png">${FUENTES}<style>${CSS}${logoAnimado.CSS}</style></head><body>`;
}

const pie = () => `<div class="pie">Entradas y transmisiones con <a href="/"><img src="/img/logo.svg" alt="${esc(config.marca)}"></a></div>`;

/** Página pública: con la marca de la plataforma o la de una productora. */
function publico({ titulo, cuerpo, productora = null, descripcion = '' }) {
  const logo = productora
    ? `<a class="logo" href="/${esc(productora.slug)}">${productora.logo ? `<img src="/logo/${productora.id}?v=${esc(String(productora.logo).length)}" alt="${esc(productora.nombre)}">` : `<span class="pn">${esc(productora.nombre)}</span>`}</a>`
    : `<a class="logo" href="/"><img src="/img/logo.svg" alt="${esc(config.marca)}"></a>`;
  return `${cabeza(titulo + (productora ? ' · ' + productora.nombre : ' · ' + config.marca), descripcion)}<div class="franja"></div>
<header class="top"><div class="in">${logo}<nav>
  <a href="/mis-entradas">Mis entradas</a>${productora ? '' : '<a href="/ingresar">Productoras</a>'}
</nav></div></header>
<main>${cuerpo}</main>${pie()}${SCRIPT}</body></html>`;
}

/** Panel de productora o de administración. */
function panel({ titulo, cuerpo, usuario, productora, activo = '' }) {
  const esAdmin = usuario && usuario.rol === 'admin';
  const items = productora
    ? [['inicio', '/panel', 'Inicio', 'casa'], ['eventos', '/panel/eventos', 'Eventos', 'cal'], ['ventas', '/panel/ventas', 'Ventas', 'billete'], ['metricas', '/panel/metricas', 'Métricas', 'grafico'], ['perfil', '/panel/perfil', 'Perfil', 'perfil']]
    : [['admin', '/admin', 'Productoras', 'gente']];
  const nav = items.map(([k, h, t]) => `<a href="${h}" class="${activo === k ? 'on' : ''}">${t}</a>`).join('');
  const barra = items.map(([k, h, t, i]) => `<a href="${h}" class="${activo === k ? 'on' : ''}">${ico(i)}${t}</a>`).join('');
  const estado = productora ? ({ test: '<span class="pill amarillo">MODO TEST</span>', activa: '<span class="pill verde">ACTIVA</span>', suspendida: '<span class="pill rojo">SUSPENDIDA</span>' }[productora.estado] || '') : '';
  const comoAdmin = usuario && usuario.comoAdmin ? `<div class="aviso" style="margin:0;border-radius:0;text-align:center">Estás viendo el panel de <b>${esc(productora.nombre)}</b> como administrador. <a href="/admin/salir-de">Volver a mi panel</a></div>` : '';
  return `${cabeza(titulo + ' · ' + config.marca)}<div class="franja"></div>${comoAdmin}
<header class="top"><div class="in"><a class="logo" href="${productora ? '/panel' : '/admin'}"><img src="/img/logo.svg" alt="${esc(config.marca)}"></a>
${productora ? `<span class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(productora.nombre)}</span> ${estado}` : '<span class="pill cyan">ADMIN</span>'}
<nav class="panel">${nav}${esAdmin && productora ? '<a href="/admin">Admin</a>' : ''}<a href="/salir">Salir</a></nav></div></header>
<main>${cuerpo}</main><nav class="barra">${barra}<a href="/salir">${ico('mas2')}Salir</a></nav>${SCRIPT}</body></html>`;
}

/** Página suelta (ingresar, registro): centrada con el logo. */
function suelta({ titulo, cuerpo }) {
  return `${cabeza(titulo + ' · ' + config.marca)}<div class="franja"></div>
<main style="max-width:460px;padding-top:40px"><p style="text-align:center;margin:0 0 22px"><a href="/"><img src="/img/logo.svg" alt="${esc(config.marca)}" style="height:54px"></a></p>${cuerpo}</main>${SCRIPT}</body></html>`;
}

const accion = (clase, href, icono, titulo, texto, pronto) => `<a class="mos ${clase}${pronto ? ' pronto' : ''}" href="${href}">
  <div class="ic">${ico(icono)}</div><b>${titulo}</b><span>${texto}</span>${pronto ? '<span class="tag">PRONTO</span>' : ''}</a>`;

module.exports = { publico, panel, suelta, accion, ico };
