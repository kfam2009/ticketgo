'use strict';
const { esc } = require('./util');

/** Página del reproductor: sin marcas, pensada para ir dentro de un iframe. */
function reproductor({ token, hlsUrl, titulo = '', marca = null }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(titulo || 'Transmisión')}</title>
<style>
html,body{margin:0;height:100%;height:100dvh;background:#000;color:#fff;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}
video{position:absolute;inset:0;width:100%;height:100%;background:#000}
#marco{position:absolute;inset:0}
#cab{display:none}
body.pagina{background:#0b0c10}
body.pagina #cab{position:absolute;top:0;left:0;right:0;height:60px;display:flex;align-items:center;gap:14px;padding:0 16px;background:#111318;border-bottom:1px solid #23262e;box-sizing:border-box}
body.pagina #marco{top:60px}
#cab img{max-height:38px;max-width:160px;object-fit:contain}
/* Celular acostado: sin cabecera, el video ocupa toda la pantalla visible y los controles quedan a la vista */
@media (orientation:landscape) and (max-height:520px){body.pagina #cab{display:none}body.pagina #marco{top:0}
 #acciones{top:6px;right:6px}#varbar{top:4px;padding:3px 5px;gap:4px}#varbar button{padding:4px 7px;font-size:12px;min-width:30px}#partes{bottom:56px}}
#cab .nom{font-weight:800;white-space:nowrap}
#cab .tit{color:#b4b9c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
#cab a{color:#fff;text-decoration:none;border:1px solid #3a3e48;border-radius:99px;padding:6px 12px;font-size:13px;font-weight:600;white-space:nowrap}
@media (max-width:560px){#cab .tit{display:none}#cab{justify-content:space-between}}
#msg{position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;text-align:center;padding:20px;background:radial-gradient(circle at 50% 40%,#1a1d24,#000 70%)}
#msg[hidden]{display:none}
#msg h2{margin:0;font-size:clamp(17px,3.2vw,24px);font-weight:700}
#msg p{margin:0;color:#b4b9c4;max-width:520px}
.btn{background:#fff;color:#000;border:0;border-radius:99px;padding:10px 18px;font:700 14px system-ui,sans-serif;cursor:pointer}
.spin{width:34px;height:34px;border:3px solid rgba(255,255,255,.18);border-top-color:#fff;border-radius:50%;animation:g 1s linear infinite}
@keyframes g{to{transform:rotate(360deg)}}
#vivo{position:absolute;top:12px;left:12px;background:#e53935;color:#fff;font:800 11px system-ui,sans-serif;letter-spacing:.08em;padding:4px 8px;border-radius:4px;pointer-events:none}
#vivo[hidden],#sonido[hidden],#partes[hidden],#airplay[hidden],#cast[hidden],#tele[hidden],#bajar[hidden],#desc[hidden]{display:none}
#varbar{position:absolute;left:0;right:0;margin:0 auto;width:max-content;top:10px;display:flex;gap:6px;align-items:center;background:rgba(10,12,16,.82);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:6px 8px;z-index:4;flex-wrap:wrap;justify-content:center;max-width:96%}
#varbar[hidden]{display:none}
#vbar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:8px 12px calc(8px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.85));z-index:4}
#vbar[hidden]{display:none}
#vbar button{background:none;border:0;color:#fff;font:700 18px system-ui,sans-serif;cursor:pointer;padding:4px 6px;min-width:34px}
#vbar input{flex:1;accent-color:#ff5252;height:28px}
#vbar span{font:600 13px system-ui,sans-serif;white-space:nowrap;min-width:64px;text-align:right}
body.pseudo #cab{display:none}body.pseudo #marco{position:fixed;inset:0;top:0;z-index:50}
#marco:fullscreen{background:#000}#marco:-webkit-full-screen{background:#000}
#varbar b{color:#ff5252;font:800 12px system-ui,sans-serif;letter-spacing:.1em;margin:0 4px}
#varbar button{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 9px;font:700 13px system-ui,sans-serif;cursor:pointer;min-width:38px}
#varbar button.on{background:#fff;color:#000}
#desc{position:absolute;top:58px;right:10px;width:min(320px,calc(100% - 20px));background:rgba(20,22,28,.97);border:1px solid #333;border-radius:12px;padding:14px;font-size:14px;z-index:5}
#desc h3{margin:0 0 8px;font-size:15px}#desc p{margin:6px 0;color:#b4b9c4;font-size:13px}
#desc a.btn{display:block;text-align:center;text-decoration:none;margin-top:8px}#desc .x{position:absolute;top:6px;right:10px;background:none;border:0;color:#fff;font-size:20px;cursor:pointer}
#acciones{position:absolute;top:10px;right:10px;display:flex;gap:8px;align-items:center;z-index:3}
.ico{width:40px;height:40px;border-radius:50%;border:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:9px;box-sizing:border-box}
.ico svg{width:22px;height:22px;fill:#fff}
.ico.on{background:#fff}.ico.on svg{fill:#000}
#aviso{position:absolute;top:58px;right:10px;max-width:280px;background:rgba(20,22,28,.95);border:1px solid #333;border-radius:10px;padding:10px 12px;font-size:13px;z-index:4}
#aviso[hidden]{display:none}
#tele{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;text-align:center;padding:20px;background:radial-gradient(circle at 50% 40%,#1a1d24,#000 70%);z-index:2}
#tele h2{margin:0;font-size:clamp(17px,3.2vw,24px)}#tele p{margin:0;color:#b4b9c4}
#partes{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:94%}
#partes button{background:rgba(0,0,0,.6);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:5px 12px;font:600 13px system-ui,sans-serif;cursor:pointer}
#partes button.on{background:#fff;color:#000}
</style></head><body>
<header id="cab">${marca && marca.logo ? `<img src="${esc(marca.logo)}" alt="${esc(marca.nombre)}">` : marca ? `<span class="nom">${esc(marca.nombre)}</span>` : ''}
<span class="tit">${esc(titulo)}</span>${marca && marca.sitio ? `<a href="${esc(marca.sitio)}">Volver</a>` : ''}</header>
<div id="marco">
<video id="v" playsinline controls controlsList="nofullscreen"></video>
<div id="vivo" hidden>EN VIVO</div>
<div id="tele" hidden><h2>Viendo en la TV</h2><p id="teleNombre"></p><p>Usá este dispositivo como control. Para volver a verlo acá, tocá el ícono de transmitir.</p></div>
<div id="acciones">
<button id="sonido" class="btn" hidden>Activar sonido</button>
<button id="airplay" class="ico" hidden title="Ver en la TV (AirPlay)" aria-label="AirPlay"><svg viewBox="0 0 24 24"><path d="M6 22h12l-6-6-6 6zM21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4v-2H3V5h18v12h-4v2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg></button>
<button id="cast" class="ico" hidden title="Ver en la TV (Chromecast)" aria-label="Ver en la TV"><svg viewBox="0 0 24 24"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2a5 5 0 0 1 5 5h2c0-3.87-3.13-7-7-7zm0-4v2a9 9 0 0 1 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg></button>
<button id="pcompleta" class="ico" title="Pantalla completa" aria-label="Pantalla completa"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button>
<button id="bajar" class="ico" hidden title="Descargar el video" aria-label="Descargar el video"><svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg></button>
<div id="aviso" hidden></div>
</div>
<div id="desc" hidden></div>
<div id="vbar" hidden><button id="vbpp" aria-label="Reproducir o pausar">⏸</button><input id="vbpos" type="range" min="0" max="100" step="0.04" value="0" aria-label="Posición"><span id="vbt">0:00</span><button id="vbmute" aria-label="Sonido">🔊</button><button id="vbpc" aria-label="Pantalla completa">⛶</button></div>
<div id="varbar" hidden><b>VAR</b><button data-s="-10" title="Atrás 10 s">⏪10</button><button data-s="-2" title="Atrás 2 s (←)">‹2s</button><button data-f="-1" title="Cuadro anterior (,)">‹|</button><button id="varpp" title="Pausa / seguir (espacio)">⏯</button><button data-f="1" title="Cuadro siguiente (.)">|›</button><button data-s="2" title="Adelante 2 s (→)">2s›</button><button id="varvel" title="Velocidad">1x</button><button id="varvivo" title="Volver al vivo">● VIVO</button></div>
<div id="partes" hidden></div>
<div id="msg"><div class="spin"></div><p>Conectando…</p></div>
</div>
<script>try{if(window.self===window.top)document.body.className='pagina'}catch(e){}</script>
<script src="${esc(hlsUrl)}"></script>
<script>
(function(){
var T=${JSON.stringify(token)};
var S=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Math.random()).slice(2)+Date.now();
var v=document.getElementById('v'),msg=document.getElementById('msg'),vivo=document.getElementById('vivo'),
    sonido=document.getElementById('sonido'),partesEl=document.getElementById('partes');
var hls=null,actual=null,parte=0,ultimo=null,timer=null,fuera=false,fuente=null,titulo='',enTele=false,castCtx=null;
var tele=document.getElementById('tele'),airplay=document.getElementById('airplay'),castBtn=document.getElementById('cast');
// Safari (Mac/iPhone): video nativo, así AirPlay manda el video a la TV
var nativo=!!window.WebKitPlaybackTargetAvailabilityEvent&&!!v.canPlayType('application/vnd.apple.mpegurl');
if(window.WebKitPlaybackTargetAvailabilityEvent){v.setAttribute('x-webkit-airplay','allow');
 v.addEventListener('webkitplaybacktargetavailabilitychanged',function(e){airplay.hidden=e.availability!=='available'});
 airplay.onclick=function(){v.webkitShowPlaybackTargetPicker()}}
var TEXTOS={espera:['La transmisión todavía no empezó','Dejá esta pantalla abierta: arranca sola cuando comience.'],
 procesando:['Preparando el video','Va a estar disponible en unos minutos. Esta pantalla se actualiza sola.'],
 terminado:['Este evento ya finalizó','Gracias por acompañarnos.'],
 cerrado:['Este evento no está disponible',''],
 error:['No pudimos conectar','Reintentamos en unos segundos…'],
 sinvideo:['El video todavía no está disponible','Volvé a entrar en un rato.']};
function mostrar(t,p,boton){msg.hidden=false;msg.innerHTML='';var h=document.createElement('h2');h.textContent=t;msg.appendChild(h);
 if(p){var q=document.createElement('p');q.textContent=p;msg.appendChild(q)}
 if(boton){var b=document.createElement('button');b.className='btn';b.textContent=boton[0];b.onclick=boton[1];msg.appendChild(b)}}
function parar(){fuente=null;if(hls){hls.destroy();hls=null}v.removeAttribute('src');try{v.load()}catch(e){}actual=null;vivo.hidden=true;partesEl.hidden=true}
function reproducir(){var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;sonido.hidden=false;v.play().catch(function(){})})}
sonido.onclick=function(){v.muted=false;sonido.hidden=true;reproducir()};
var saltar=0;v.addEventListener('loadedmetadata',function(){if(saltar>0){try{v.currentTime=saltar}catch(e){}}saltar=0});
function cargar(f){actual=f.id;fuente=f;msg.hidden=true;saltar=Number(f.inicio)||0;
 if(enTele){castCargar(f);return}
 if(nativo){if(hls){hls.destroy();hls=null}v.src=f.url;reproducir();return}
 if(window.Hls&&Hls.isSupported()){if(hls)hls.destroy();hls=new Hls(modoVar?{lowLatencyMode:false,backBufferLength:900,maxBufferLength:30}:{lowLatencyMode:true,backBufferLength:60});
  hls.on(Hls.Events.ERROR,function(e,d){if(d.fatal){if(d.type===Hls.ErrorTypes.MEDIA_ERROR){hls.recoverMediaError()}else{parar();setTimeout(function(){pedir('iniciar')},3000)}}});
  hls.loadSource(f.url);hls.attachMedia(v);hls.on(Hls.Events.MANIFEST_PARSED,reproducir)}
 else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=f.url;reproducir()}
 else{mostrar('Tu navegador no puede reproducir este video','Probá con Chrome, Safari o Firefox actualizados.')}}
function dibujarPartes(fs){partesEl.innerHTML='';if(fs.length<2){partesEl.hidden=true;return}partesEl.hidden=false;
 fs.forEach(function(f,i){var b=document.createElement('button');b.textContent=f.titulo||('Parte '+(i+1));if(i===parte)b.className='on';
  b.onclick=function(){parte=i;if(fs[i].id===actual&&!enTele){try{v.currentTime=Number(fs[i].inicio)||0}catch(e){}reproducir()}else{cargar(fs[i])}dibujarPartes(fs)};partesEl.appendChild(b)})}
function aplicar(d){
 if(d.titulo)titulo=d.titulo;
 if(d.expulsado||d.error||d.ocupado){castCortar()}
 if(d.ocupado){fuera=true;parar();clearInterval(timer);
  mostrar('Este código ya se está usando en otra pantalla','Cada código se puede ver en un solo dispositivo a la vez. Si cerraste la otra pantalla, esperá un minuto y tocá Reintentar.',['Reintentar',function(){fuera=false;mostrar('Conectando…');pedir('iniciar');clearInterval(timer);timer=setInterval(function(){pedir('latido')},20000)}]);return}
 if(d.expulsado){fuera=true;parar();clearInterval(timer);
  mostrar('Esta entrada se está viendo en otra pantalla','Cada entrada se puede ver en un solo dispositivo a la vez.');return}
 if(d.error){parar();clearInterval(timer);mostrar(d.error,d.detalle||'');return}
 var antesVar=modoVar;modoVar=!!d.var;varbar.hidden=!(modoVar&&(d.estado==='vivo'||d.estado==='repeticion'||d.estado==='grabado'));usarControlesPropios(!varbar.hidden);if(modoVar&&!antesVar){actual=null}
 ultimo=d.estado;bajar.hidden=!d.descargable;if(!d.descargable)desc.hidden=true;
 if(d.estado==='vivo'||d.estado==='repeticion'||d.estado==='grabado'){var fs=d.fuentes||[];if(!fs.length)return;
  if(parte>=fs.length)parte=fs.length-1;
  if(d.estado==='vivo')parte=0;
  vivo.hidden=d.estado!=='vivo';
  if(actual!==fs[parte].id)cargar(fs[parte]);
  if(d.estado!=='vivo')dibujarPartes(fs);else partesEl.hidden=true;return}
 parar();var t=TEXTOS[d.estado]||TEXTOS.error;mostrar(t[0],t[1]);}
var modoVar=false,varbar=document.getElementById('varbar'),velBtn=document.getElementById('varvel');
function varMover(s){try{v.currentTime=Math.max(0,v.currentTime+s)}catch(e){}}
varbar.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
 if(b.dataset.s){varMover(Number(b.dataset.s));return}
 if(b.dataset.f){v.pause();varMover(Number(b.dataset.f)/30);return}
 if(b.id==='varpp'){if(v.paused)reproducir();else v.pause();return}
 if(b.id==='varvel'){var r=v.playbackRate===1?0.5:v.playbackRate===0.5?0.25:1;v.playbackRate=r;velBtn.textContent=(r===1?'1':r)+'x';velBtn.className=r===1?'':'on';return}
 if(b.id==='varvivo'){v.playbackRate=1;velBtn.textContent='1x';velBtn.className='';
  if(hls&&hls.liveSyncPosition){v.currentTime=hls.liveSyncPosition}else if(v.seekable&&v.seekable.length){v.currentTime=v.seekable.end(v.seekable.length-1)-3}reproducir()}});
document.addEventListener('keydown',function(e){if(!modoVar||/input|textarea/i.test(e.target.tagName))return;
 if(e.key==='ArrowLeft'){varMover(-2);e.preventDefault()}else if(e.key==='ArrowRight'){varMover(2);e.preventDefault()}
 else if(e.key===','){v.pause();varMover(-1/30)}else if(e.key==='.'){v.pause();varMover(1/30)}
 else if(e.key===' '){if(v.paused)reproducir();else v.pause();e.preventDefault()}});
/* Pantalla completa propia: pone en pantalla completa todo el reproductor (con la barra VAR y los botones), no solo el video */
var marco=document.getElementById('marco'),pcBtn=document.getElementById('pcompleta');
function enPC(){return document.fullscreenElement||document.webkitFullscreenElement}
pcBtn.onclick=function(){
 if(document.body.classList.contains('pseudo')){document.body.classList.remove('pseudo');return}
 if(enPC()){(document.exitFullscreen||document.webkitExitFullscreen).call(document);return}
 var req=marco.requestFullscreen||marco.webkitRequestFullscreen;
 if(req){var p=req.call(marco,{navigationUI:'hide'});var lock=function(){try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(function(){})}catch(e){}};if(p&&p.then)p.then(lock).catch(function(){});else lock();return}
 if(modoVar){document.body.classList.toggle('pseudo');window.scrollTo(0,1);return}
 if(v.webkitEnterFullscreen){v.webkitEnterFullscreen()}};
v.addEventListener('dblclick',function(){pcBtn.click()});
/* Controles propios (modo VAR): así la pantalla completa nunca es la del sistema y la barra VAR queda siempre a la vista */
var vbar=document.getElementById('vbar'),vbpos=document.getElementById('vbpos'),vbt=document.getElementById('vbt'),vbpp=document.getElementById('vbpp'),vbmute=document.getElementById('vbmute'),arrastrando=false;
function rango(){var sk=v.seekable;if(sk&&sk.length){return[sk.start(0),sk.end(sk.length-1)]}return[0,isFinite(v.duration)?v.duration:0]}
function mmss(t){t=Math.max(0,Math.round(t));var h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;return(h?h+':'+(m<10?'0':''):'')+m+':'+(x<10?'0':'')+x}
function pintar(){if(!modoVar)return;var r=rango();vbpos.min=r[0];vbpos.max=r[1]||1;if(!arrastrando)vbpos.value=v.currentTime;
 vbt.textContent=ultimo==='vivo'?(r[1]-v.currentTime>8?'-'+mmss(r[1]-v.currentTime):'EN VIVO'):mmss(v.currentTime)+' / '+mmss(r[1]);vbpp.textContent=v.paused?'▶':'⏸';vbmute.textContent=v.muted?'🔇':'🔊'}
['timeupdate','play','pause','durationchange','progress','volumechange'].forEach(function(n){v.addEventListener(n,pintar)});
vbpos.addEventListener('input',function(){arrastrando=true;vbt.textContent=mmss(vbpos.value)});
vbpos.addEventListener('change',function(){arrastrando=false;try{v.currentTime=Number(vbpos.value)}catch(e){}});
vbpp.onclick=function(){if(v.paused)reproducir();else v.pause()};
vbmute.onclick=function(){v.muted=!v.muted;sonido.hidden=true};
document.getElementById('vbpc').onclick=function(){pcBtn.click()};
function usarControlesPropios(si){v.controls=!si;vbar.hidden=!si;if(si)pintar()}
var bajar=document.getElementById('bajar'),desc=document.getElementById('desc');
function cajaDesc(){desc.hidden=false;desc.innerHTML='<button class="x" aria-label="Cerrar">×</button><h3>Descargar el video</h3>';desc.querySelector('.x').onclick=function(){desc.hidden=true};return desc}
function pedirDescarga(){var c=cajaDesc();var p=document.createElement('p');p.textContent='Preparando…';c.appendChild(p);
 fetch('/ver/'+encodeURIComponent(T)+'/descarga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({s:S}),cache:'no-store'})
 .then(function(r){return r.json()}).then(function(d){c=cajaDesc();
  if(d.error){var e=document.createElement('p');e.textContent=d.error;c.appendChild(e);return}
  var falta=false;(d.archivos||[]).forEach(function(a){
   if(a.listo){var l=document.createElement('a');l.className='btn';l.href=a.url;l.target='_blank';l.rel='noopener';l.setAttribute('download','');l.textContent=(d.archivos.length>1?a.titulo+' · ':'')+'Descargar MP4';c.appendChild(l)}
   else{falta=true;var q=document.createElement('p');q.textContent=(d.archivos.length>1?a.titulo+': ':'')+'preparando el archivo'+(a.pct?' ('+a.pct+'%)':'')+'…';c.appendChild(q)}});
  var n=document.createElement('p');n.textContent=falta?'La primera vez tarda unos minutos. Volvé a tocar el botón de descarga en un rato.':'El link es personal y vence en unas horas.';c.appendChild(n)})
 .catch(function(){c=cajaDesc();var e=document.createElement('p');e.textContent='No se pudo conectar. Probá de nuevo.';c.appendChild(e)})}
bajar.onclick=function(){if(!desc.hidden){desc.hidden=true;return}pedirDescarga()};
function pedir(que){if(fuera&&que==='latido')return;
 fetch('/ver/'+encodeURIComponent(T)+'/'+que,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({s:S,estado:ultimo}),cache:'no-store'})
 .then(function(r){return r.json()}).then(aplicar).catch(function(){if(!actual)mostrar(TEXTOS.error[0],TEXTOS.error[1])})}
/* ---------- Chromecast ---------- */
function castCortar(){try{if(castCtx&&enTele)castCtx.endCurrentSession(true)}catch(e){}}
function formatoFmp4(url){
 // Si los segmentos son fMP4 el receptor necesita saberlo
 return fetch(url).then(function(r){return r.text()}).then(function(t){
  if(t.indexOf('#EXT-X-MAP')>=0)return true;
  var l=t.split(/\\r?\\n/).filter(function(x){return x&&x[0]!=='#'})[0];
  if(!l)return false;
  return fetch(new URL(l.trim(),url).href).then(function(r){return r.text()}).then(function(t2){return t2.indexOf('#EXT-X-MAP')>=0})
 }).catch(function(){return false})}
function castCargar(f){
 var ses=castCtx&&castCtx.getCurrentSession();if(!ses)return;
 v.pause();tele.hidden=false;
 formatoFmp4(f.url).then(function(fmp4){
  var mi=new chrome.cast.media.MediaInfo(f.url,'application/x-mpegurl');
  mi.streamType=ultimo==='vivo'?chrome.cast.media.StreamType.LIVE:chrome.cast.media.StreamType.BUFFERED;
  if(fmp4){mi.hlsSegmentFormat=chrome.cast.media.HlsSegmentFormat.FMP4;mi.hlsVideoSegmentFormat=chrome.cast.media.HlsVideoSegmentFormat.FMP4}
  var md=new chrome.cast.media.GenericMediaMetadata();md.title=titulo||'Transmisión';mi.metadata=md;
  var rq=new chrome.cast.media.LoadRequest(mi);rq.autoplay=true;
  if(ultimo!=='vivo'&&v.currentTime>5)rq.currentTime=v.currentTime;
  ses.loadMedia(rq).catch(function(){})})}
window.__onGCastApiAvailable=function(ok){
 if(!ok||!window.cast||!cast.framework)return;
 castCtx=cast.framework.CastContext.getInstance();
 castCtx.setOptions({receiverApplicationId:chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,autoJoinPolicy:chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED});
  castBtn.hidden=false;
 castCtx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED,function(e){
  var S2=cast.framework.SessionState;
  if(e.sessionState===S2.SESSION_STARTED||e.sessionState===S2.SESSION_RESUMED){
   enTele=true;castBtn.classList.add('on');var dev=e.session.getCastDevice();document.getElementById('teleNombre').textContent=dev&&dev.friendlyName?dev.friendlyName:'';
   if(fuente)castCargar(fuente)}
  else if(e.sessionState===S2.SESSION_ENDED){
   enTele=false;castBtn.classList.remove('on');tele.hidden=true;if(fuente){var f=fuente;actual=null;cargar(f)}}})};
// Botón propio: visible en Chrome aunque el sistema de Chromecast tarde en cargar
var esChrome=!!window.chrome&&/Chrome|CriOS/.test(navigator.userAgent)&&!/Edg|OPR|SamsungBrowser/.test(navigator.userAgent);
if(esChrome)castBtn.hidden=false;
function avisar(t){var a=document.getElementById('aviso');a.textContent=t;a.hidden=false;clearTimeout(avisar.t);avisar.t=setTimeout(function(){a.hidden=true},7000)}
castBtn.onclick=function(){
 if(castCtx){if(enTele){castCtx.endCurrentSession(true);return}
  castCtx.requestSession().catch(function(e){if(e!=='cancel')avisar('No se encontró ninguna TV con Chromecast en este Wi-Fi. Probá desde el menú ⋮ de Chrome → Transmitir.')});return}
 avisar('Para ver en la TV usá el menú ⋮ de Chrome → Transmitir, con la TV en el mismo Wi-Fi.')};
(function(){var s=document.createElement('script');s.src='https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';s.async=true;document.head.appendChild(s)})();
pedir('iniciar');timer=setInterval(function(){pedir('latido')},20000);
document.addEventListener('visibilitychange',function(){if(!document.hidden&&!fuera)pedir('latido')});
// Al cerrar la página se libera el código enseguida (sin esperar el minuto)
window.addEventListener('pagehide',function(){if(fuera||!navigator.sendBeacon)return;
 try{navigator.sendBeacon('/ver/'+encodeURIComponent(T)+'/salir',new Blob([JSON.stringify({s:S})],{type:'application/json'}))}catch(e){}});
})();
</script></body></html>`;
}

function mensaje(titulo, texto) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titulo)}</title>
<style>html,body{margin:0;height:100%;background:#000;color:#fff;font:15px/1.45 system-ui,sans-serif}
div{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;gap:10px}
h2{margin:0;font-size:22px}p{margin:0;color:#b4b9c4;max-width:520px}</style></head>
<body><div><h2>${esc(titulo)}</h2><p>${esc(texto)}</p></div></body></html>`;
}


module.exports = { reproductor, mensaje };
