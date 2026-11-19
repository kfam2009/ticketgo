'use strict';
/**
 * App de TV (Android TV / Google TV / Fire TV): emparejamiento.
 *
 * 1. La TV pide un número de 4 cifras (POST /tv/api/nuevo) y lo muestra con un QR a /tv?c=NNNN.
 * 2. Desde el celular, con la entrada abierta (botón "App de TV") o en /tv con el código de la entrada,
 *    se vincula ese número (POST /tv/api/vincular).
 * 3. La TV consulta (GET /tv/api/estado) y recibe un link firmado para usar la misma API del reproductor web
 *    (/ver/<t>/iniciar y /latido). La TV queda con la pantalla: si era una compra, el celular se corta.
 * También se puede escribir el código de la entrada con el control remoto (POST /tv/api/codigo).
 */
const crypto = require('node:crypto');
const { db } = require('../lib/db');
const { firmar, verificar, esc } = require('../lib/util');
const { enviar, json, redirigir, leerCuerpo, ipDe, limite } = require('../lib/http');
const { suelta } = require('../lib/vistas');
const { normalizarCodigo } = require('../lib/ventas');

const APK = 'https://github.com/kfam2009/ticketgo/releases/download/tv-latest/TicketGo-TV.apk';
const VIGENCIA_PAR = 15 * 60e3; // el número de la TV dura 15 minutos
const DIAS_TV = 30; // la TV queda vinculada 30 días (o hasta que la entrada se anule)
const pares = new Map(); // número -> { id, s, creado, t }

function limpiar() {
  const ahora = Date.now();
  for (const [k, v] of pares) if (ahora - v.creado > VIGENCIA_PAR) pares.delete(k);
}

function nuevoNumero() {
  for (let i = 0; i < 50; i++) {
    const n = String(crypto.randomInt(1000, 10000));
    if (!pares.has(n)) return n;
  }
  return null;
}

/** Deja la entrada en la TV: le pasa la pantalla a la sesión de la TV y le arma un link de 30 días. */
function entregar(par, a) {
  db.prepare('UPDATE accesos SET sesion = ?, sesion_latido = ? WHERE id = ?').run(par.s, Date.now(), a.id);
  par.t = firmar({ a: a.id, e: Math.floor(Date.now() / 1000) + DIAS_TV * 86400 });
  const ev = db.prepare('SELECT titulo FROM eventos WHERE id = ?').get(a.evento_id);
  par.titulo = ev ? ev.titulo : '';
}

function accesoDeLink(t) {
  const d = verificar(String(t || ''));
  if (!d || typeof d.a !== 'number' || d.vencido) return null;
  return db.prepare('SELECT * FROM accesos WHERE id = ? AND revocado = 0').get(d.a) || null;
}

function pagina(numero = '', error = '', ok = '') {
  const cuerpo = `<div class="card" style="max-width:460px;margin:0 auto">
    <h1 style="margin-top:0">Ver en la TV</h1>
    ${ok ? `<div class="okmsg">${esc(ok)}</div><p class="muted">Ya podés cerrar esta página. En la TV, el video arranca en unos segundos.</p></div>`
    : `<p class="muted">Abrí la app <b>TicketGo</b> en tu televisor. Vas a ver un <b>número de 4 cifras</b>.</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <form method="post" action="/tv">
      <label>Número que aparece en la TV</label>
      <input name="numero" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required value="${esc(numero)}" style="font-size:28px;letter-spacing:8px;text-align:center">
      <label>Código de tu entrada</label>
      <input name="codigo" required maxlength="12" placeholder="ABCD-1234" autocapitalize="characters" style="font-size:20px;letter-spacing:3px;text-align:center">
      <p class="muted" style="font-size:13px">Está en el mail de tu entrada (por ejemplo <b>ticketgoplus.com/v/<u>ABCD-1234</u></b>). También podés abrir tu entrada en el celular y tocar <b>📺 App de TV</b>.</p>
      <button class="btn ancho" style="margin-top:10px">Ver en la TV</button>
    </form>
    <p class="muted" style="font-size:13px;margin-top:22px">¿No tenés la app? En Android TV / Google TV / Fire TV instalá <b>Downloader</b> y escribí <b>ticketgoplus.com/app</b>.</p></div>`}`;
  return suelta({ titulo: 'Ver en la TV', cuerpo });
}


/** Versión para el navegador del televisor (teles sin Android: Philips Saphi, Samsung, LG). Código ES5 simple. */
function tele() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>TicketGo TV</title>
<style>
html,body{margin:0;height:100%;background:#0b0c10;color:#fff;font-family:Arial,Helvetica,sans-serif;overflow:hidden}
#panel{position:absolute;left:0;top:0;width:100%;height:100%;text-align:center;background:#0b0c10}
#caja{position:absolute;left:0;right:0;top:50%;margin-top:-230px}
h1{font-size:44px;margin:0 0 6px}#tit{font-size:24px;color:#b4b9c4;margin:0 0 24px;min-height:30px}
#fila{display:inline-block}
#num{font-size:110px;font-weight:bold;color:#ffd600;letter-spacing:18px;line-height:1}
#qr{display:inline-block;vertical-align:middle;margin-left:50px;background:#fff;padding:10px}
#izq{display:inline-block;vertical-align:middle}
#info{font-size:24px;line-height:1.5;margin-top:16px}
#msg{font-size:28px;line-height:1.5;margin-top:10px}
button,input{font-size:24px;padding:14px 26px;border-radius:10px;border:3px solid #444;background:#222;color:#fff;margin:22px 8px 0}
button:focus,input:focus{border-color:#ffd600;outline:none;background:#333}
#cod{display:none}
video{position:absolute;left:0;top:0;width:100%;height:100%;background:#000}
#ctl{position:absolute;left:0;right:0;bottom:0;padding:22px 10px 30px;background:linear-gradient(transparent,rgba(0,0,0,.85));text-align:center;display:none}
#ctl button{font-size:30px;padding:18px 34px;margin:0 10px;border-width:4px;min-width:150px}
#ctl button:focus,#ctl button.f{border-color:#ffd600;background:#ffd600;color:#000}
#ctl #cpp{min-width:220px}
#cnota{font-size:20px;color:#ddd;margin-top:12px;min-height:24px}
</style></head><body>
<video id="v" playsinline></video>
<div id="panel"><div id="caja">
 <h1>TicketGo</h1><p id="tit"></p>
 <div id="fila"><div id="izq"><div id="num"></div><div id="info"></div></div><div id="qr"></div></div>
 <div id="msg"></div>
 <div><button id="bcod">Escribir el código de mi entrada</button></div>
 <div id="cod"><input id="icod" maxlength="12" placeholder="ABCD-1234"><button id="ok">Ver</button></div>
</div></div>
<div id="ctl"><button id="cmen">⏪ 10 s</button><button id="cpp">❚❚ Pausa</button><button id="cmas">10 s ⏩</button><button id="csal">✕ Salir</button><div id="cnota"></div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script src="/js/r.js"></script>
<script>
(function(){
var $=function(i){return document.getElementById(i)};
var v=$('v'),panel=$('panel'),T=null,S=null,parId=null,estado='',fuente='',hls=null,tLat=null,tPar=null,mirando=false,atras=0;
function guardar(){try{localStorage.setItem('tgtv',JSON.stringify({t:T,s:S}))}catch(e){}}
try{var g=JSON.parse(localStorage.getItem('tgtv')||'{}');T=g.t||null;S=g.s||null}catch(e){}
function xhr(m,u,b,cb){var x=new XMLHttpRequest();x.open(m,u,true);x.timeout=15000;if(b)x.setRequestHeader('Content-Type','application/json');
 x.onreadystatechange=function(){if(x.readyState!==4)return;var d=null;try{d=JSON.parse(x.responseText)}catch(e){}cb(x.status,d)};
 x.ontimeout=function(){cb(0,null)};x.send(b?JSON.stringify(b):null)}
function ver(tit,num,info,msg,qr,boton){panel.style.display='block';$('tit').innerHTML=tit||'';$('num').innerHTML=num||'';$('info').innerHTML=info||'';$('msg').innerHTML=msg||'';
 $('fila').style.display=num?'inline-block':'none';$('qr').innerHTML='';$('bcod').parentNode.style.display=boton?'block':'none';
 if(qr&&window.qrcode){try{var q=qrcode(0,'M');q.addData(qr);q.make();$('qr').innerHTML=q.createImgTag(6,0)}catch(e){}}
 $('qr').style.display=($('qr').innerHTML?'inline-block':'none');if(boton)$('bcod').focus()}
function parar(){try{if(hls){hls.destroy();hls=null}v.pause();v.removeAttribute('src');v.load()}catch(e){}fuente='';ocultarCtl()}
function emparejar(){mirando=false;clearTimeout(tLat);clearTimeout(tPar);parar();ver('Ver en este televisor','','','Conectando…',null,true);
 xhr('POST','/tv/api/nuevo',{},function(st,d){if(!d||!d.numero){ver('Ver en este televisor','','','No hay conexión. Reintentando…',null,true);tPar=setTimeout(emparejar,5000);return}
  parId=d.id;S=d.s;guardar();
  ver('Ver en este televisor',d.numero,'En tu celular entrá a<br><b>ticketgoplus.com/tv</b><br>(o escaneá el código)<br>y escribí este número.','', location.protocol+'//'+location.host+'/tv?c='+d.numero,true);
  tPar=setTimeout(consultar,2000)})}
function consultar(){if(mirando||!parId)return;var id=parId;
 xhr('GET','/tv/api/estado?id='+encodeURIComponent(id),null,function(st,d){if(mirando||id!==parId)return;
  if(d&&d.listo){T=d.t;guardar();mirar()}else if(d&&d.vencido){emparejar()}else{tPar=setTimeout(consultar,2000)}})}
$('bcod').onclick=function(){$('cod').style.display='block';$('icod').focus()};
$('ok').onclick=function(){if(!S)S='tv-'+Math.random().toString(36).slice(2,14);$('msg').innerHTML='Revisando el código…';
 xhr('POST','/tv/api/codigo',{codigo:$('icod').value,s:S},function(st,d){if(d&&d.t){T=d.t;S=d.s||S;guardar();parId=null;mirar()}else{$('msg').innerHTML=(d&&d.error)||'Sin conexión'}})};
$('icod').onkeydown=function(e){if(e.keyCode===13)$('ok').onclick()};
function mirar(){mirando=true;clearTimeout(tPar);ver('','','','Cargando…',null,false);pedir('iniciar')}
function pedir(que){if(!mirando||!T)return;clearTimeout(tLat);
 xhr('POST','/ver/'+encodeURIComponent(T)+'/'+que,{s:S,estado:estado},function(st,d){aplicar(d)})}
function aplicar(d){if(!mirando)return;
 if(!d){$('msg').innerHTML='Sin conexión, reintentando…';tLat=setTimeout(function(){pedir('latido')},8000);return}
 if(d.expulsado||d.ocupado){parar();ver('','','','Tu entrada se está viendo en otra pantalla.<br>Para verla acá, vinculá este televisor de nuevo.',null,false);T=null;guardar();mirando=false;setTimeout(emparejar,6000);return}
 if(d.error){parar();ver('','','',d.error+'<br>'+(d.detalle||''),null,false);T=null;guardar();mirando=false;setTimeout(emparejar,6000);return}
 estado=d.estado;var hay=(d.estado==='vivo'||d.estado==='repeticion'||d.estado==='grabado');
 if(hay){if(d.fuentes&&d.fuentes.length)reproducir(d.fuentes[0].url,d.fuentes[0].id);if(fuente)panel.style.display='none'}
 else{parar();var m={espera:'Todavía no empezó la transmisión.<br>Arranca sola cuando llegue la señal.',procesando:'Terminó la transmisión.<br>Estamos preparando la repetición…',terminado:'Este evento terminó y la repetición ya no está disponible.'};
  ver(d.titulo||'','','',m[d.estado]||'No disponible por ahora.',null,false)}
 tLat=setTimeout(function(){pedir('latido')},20000)}
function reproducir(url,id){if(fuente===id)return;parar();fuente=id;
 var nativo=v.canPlayType&&v.canPlayType('application/vnd.apple.mpegurl');
 if(window.Hls&&Hls.isSupported()){hls=new Hls({lowLatencyMode:false});hls.loadSource(url);hls.attachMedia(v);
  hls.on(Hls.Events.MANIFEST_PARSED,function(){var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;v.play()})});
  hls.on(Hls.Events.ERROR,function(e,x){if(x.fatal){fuente='';setTimeout(function(){pedir('iniciar')},3000)}})}
 else if(nativo){v.src=url;var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;v.play()})}
 else{fuente='';ver('','','','Este televisor no puede reproducir el video.<br>Probá con un Chromecast o un stick Android.',null,false);return}
 panel.style.display='none';mostrarCtl()}
v.onerror=function(){if(mirando){fuente='';setTimeout(function(){pedir('iniciar')},3000)}};
var ctl=$('ctl'),bots=[$('cmen'),$('cpp'),$('cmas'),$('csal')],foco=1,tCtl=null,salir=0;
function pintarPP(){$('cpp').innerHTML=v.paused?'▶ Seguir':'❚❚ Pausa'}
function enfocar(i){foco=(i+bots.length)%bots.length;for(var j=0;j<bots.length;j++)bots[j].className=(j===foco?'f':'');try{bots[foco].focus()}catch(e){}}
function mostrarCtl(){if(!mirando||panel.style.display!=='none')return;pintarPP();ctl.style.display='block';enfocar(foco);clearTimeout(tCtl);tCtl=setTimeout(ocultarCtl,7000)}
function ocultarCtl(){ctl.style.display='none';$('cnota').innerHTML='';salir=0}
function saltar(x){try{var d=v.currentTime+x;if(v.seekable&&v.seekable.length){d=Math.max(v.seekable.start(0),Math.min(d,v.seekable.end(v.seekable.length-1)-1))}v.currentTime=Math.max(0,d)}catch(e){}mostrarCtl()}
function pp(){try{if(v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()}catch(e){}setTimeout(pintarPP,100);mostrarCtl()}
function desvincular(){var a=Date.now();if(a-salir<5000){xhr('POST','/ver/'+encodeURIComponent(T)+'/salir',{s:S},function(){});T=null;guardar();ocultarCtl();emparejar()}
 else{salir=a;$('cnota').innerHTML='Apretá <b>Salir</b> otra vez para desvincular este televisor';mostrarCtl()}}
$('cmen').onclick=function(){saltar(-10)};$('cmas').onclick=function(){saltar(10)};$('cpp').onclick=pp;$('csal').onclick=desvincular;
v.onplay=pintarPP;v.onpause=pintarPP;
v.onclick=mostrarCtl;document.onmousemove=function(){if(ctl.style.display!=='block')mostrarCtl()};
function tecla(e){var k=e.keyCode||e.which;
 if(!mirando||panel.style.display!=='none')return; /* en la pantalla del número, que el navegador maneje el foco */
 if(k===415||k===19||k===10252||k===179||k===463){pp();e.preventDefault();return}
 if(k===412||k===227){saltar(-10);e.preventDefault();return}
 if(k===417||k===228){saltar(10);e.preventDefault();return}
 if(k===8||k===461||k===10009||k===27||k===166){if(ctl.style.display==='block'){ocultarCtl()}else{mostrarCtl()}e.preventDefault();return}
 if(ctl.style.display!=='block'){mostrarCtl();e.preventDefault();return}
 if(k===37){enfocar(foco-1);mostrarCtl();e.preventDefault();return}
 if(k===39){enfocar(foco+1);mostrarCtl();e.preventDefault();return}
 if(k===13||k===32){bots[foco].onclick();e.preventDefault();return}
 mostrarCtl()}
if(document.addEventListener){document.addEventListener('keydown',tecla,true)}else{document.onkeydown=tecla}
if(T&&S)mirar();else emparejar();
})();
</script></body></html>`;
}

async function manejar(req, res, url, partes) {
  if (partes[0] === 'app' && partes.length === 1) return redirigir(res, APK), true;
  if (partes[0] === 'tele' && partes.length === 1) return enviar(res, 200, tele()), true;
  if (partes[0] !== 'tv') return false;
  limpiar();

  // ---- API de la app
  if (partes[1] === 'api') {
    if (partes[2] === 'nuevo' && req.method === 'POST') {
      if (!limite('tvnuevo:' + ipDe(req), 30, 10 * 60e3)) return json(res, 429, { error: 'Demasiados intentos' }), true;
      const numero = nuevoNumero();
      if (!numero) return json(res, 503, { error: 'Probá de nuevo' }), true;
      const par = { id: crypto.randomBytes(16).toString('hex'), s: 'tv-' + crypto.randomBytes(12).toString('hex'), creado: Date.now(), t: null };
      pares.set(numero, par);
      return json(res, 200, { numero, id: par.id, s: par.s, vence: VIGENCIA_PAR / 1000 }), true;
    }
    if (partes[2] === 'estado' && req.method === 'GET') {
      const id = String(url.searchParams.get('id') || '');
      for (const par of pares.values()) {
        if (par.id === id) return json(res, 200, par.t ? { listo: true, t: par.t, titulo: par.titulo } : { listo: false }), true;
      }
      return json(res, 404, { vencido: true }), true;
    }
    if (partes[2] === 'vincular' && req.method === 'POST') {
      // Desde el reproductor del celular: { numero, t }
      const b = await leerCuerpo(req, 4096);
      if (!limite('tvvinc:' + ipDe(req), 20, 10 * 60e3)) return json(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' }), true;
      const par = pares.get(String(b.numero || '').replace(/\D/g, ''));
      if (!par) return json(res, 200, { error: 'Ese número no está activo. Fijate el que aparece ahora en la TV.' }), true;
      const a = accesoDeLink(b.t);
      if (!a) return json(res, 200, { error: 'Tu link venció. Volvé a abrir tu entrada desde el mail.' }), true;
      entregar(par, a);
      return json(res, 200, { ok: true }), true;
    }
    if (partes[2] === 'codigo' && req.method === 'POST') {
      // Desde la TV con el control remoto: { codigo, s }
      const b = await leerCuerpo(req, 4096);
      if (!limite('tvcod:' + ipDe(req), 15, 10 * 60e3)) return json(res, 429, { error: 'Demasiados intentos. Esperá unos minutos.' }), true;
      const a = db.prepare('SELECT * FROM accesos WHERE codigo = ? AND revocado = 0').get(normalizarCodigo(b.codigo));
      if (!a) return json(res, 200, { error: 'Código no válido. Revisalo en el mail de tu entrada.' }), true;
      const par = { s: String(b.s || '').slice(0, 64) || 'tv-' + crypto.randomBytes(12).toString('hex') };
      entregar(par, a);
      return json(res, 200, { t: par.t, s: par.s, titulo: par.titulo }), true;
    }
    return json(res, 404, { error: 'Ruta inexistente' }), true;
  }

  // ---- Página para el celular (destino del QR)
  if (partes.length === 1) {
    if (req.method === 'POST') {
      const b = await leerCuerpo(req, 4096);
      const numero = String(b.numero || '').replace(/\D/g, '');
      if (!limite('tvweb:' + ipDe(req), 20, 10 * 60e3)) return enviar(res, 429, pagina(numero, 'Demasiados intentos. Esperá unos minutos.')), true;
      const par = pares.get(numero);
      if (!par) return enviar(res, 200, pagina(numero, 'Ese número no está activo. Fijate el que aparece ahora en la TV.')), true;
      const a = db.prepare('SELECT * FROM accesos WHERE codigo = ? AND revocado = 0').get(normalizarCodigo(b.codigo));
      if (!a) return enviar(res, 200, pagina(numero, 'El código de la entrada no es válido. Revisalo en el mail.')), true;
      entregar(par, a);
      return enviar(res, 200, pagina('', '', '¡Listo! Tu entrada ya está en la TV.')), true;
    }
    return enviar(res, 200, pagina(String(url.searchParams.get('c') || '').replace(/\D/g, '').slice(0, 4))), true;
  }
  return false;
}

module.exports = { manejar };
