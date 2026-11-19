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
 #acciones{top:6px;right:6px}#partes{bottom:56px}}
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
#varbar{position:absolute;display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;background:rgba(10,12,16,.88);border:1px solid rgba(255,255,255,.22);border-radius:18px;padding:10px 14px;z-index:4;box-sizing:border-box}
#varbar.pos-arriba{top:58px;left:0;right:0;margin:0 auto;width:max-content;max-width:99%}
#varbar.pos-abajo{bottom:60px;left:0;right:0;margin:0 auto;width:max-content;max-width:99%}
#varbar.pos-izq,#varbar.pos-der{top:50%;transform:translateY(-50%);display:grid;grid-template-columns:auto auto;gap:7px;max-height:calc(100% - 130px);overflow-y:auto;padding:10px}
#varbar.pos-izq{left:8px}#varbar.pos-der{right:8px}
#varbar.pos-izq>*,#varbar.pos-der>*{width:100%}
#varbar.pos-izq b,#varbar.pos-der b{grid-column:span 2;text-align:center;margin:0}
#varbar.pos-izq #varatras,#varbar.pos-der #varatras{order:1}#varbar.pos-izq #varplay,#varbar.pos-der #varplay{order:2}
#varbar.pos-izq #varpausa,#varbar.pos-der #varpausa{order:3;grid-column:span 2}
#varbar.pos-izq [data-f='-1'],#varbar.pos-der [data-f='-1']{order:4}#varbar.pos-izq [data-f='1'],#varbar.pos-der [data-f='1']{order:5}
#varbar.pos-izq [data-s='-2'],#varbar.pos-der [data-s='-2']{order:6}#varbar.pos-izq [data-s='2'],#varbar.pos-der [data-s='2']{order:7}
#varbar.pos-izq #varvel,#varbar.pos-der #varvel{order:9}
#varbar.pos-izq #varvivo,#varbar.pos-der #varvivo{order:10;grid-column:span 2}#varbar.pos-izq #varpos,#varbar.pos-der #varpos{order:17;grid-column:span 2}
#varbar.pos-izq button,#varbar.pos-der button{padding:11px 12px;font-size:20px;min-width:60px}
#varbar[hidden]{display:none}
#vbar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:8px 12px calc(8px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.85));z-index:4}
#vbar[hidden]{display:none}
#vbar button{background:none;border:0;color:#fff;font:700 18px system-ui,sans-serif;cursor:pointer;padding:4px 6px;min-width:34px}
#vbar input{flex:1;accent-color:#ff5252;height:28px}
#vbar span{font:600 13px system-ui,sans-serif;white-space:nowrap;min-width:64px;text-align:right}
body.pseudo #cab{display:none}body.pseudo #marco{position:fixed;inset:0;top:0;z-index:50}
#marco:fullscreen{background:#000}#marco:-webkit-full-screen{background:#000}
#varbar b{color:#ff5252;font:800 17px system-ui,sans-serif;letter-spacing:.1em;margin:0 6px}
#varbar button{background:rgba(255,255,255,.1);color:#fff;border:2px solid rgba(255,255,255,.25);border-radius:12px;padding:14px 18px;font:700 22px system-ui,sans-serif;cursor:pointer;min-width:66px;line-height:1;transition:background .12s,transform .08s;touch-action:manipulation}
#varbar button:active{transform:scale(.94)}
#varbar button.flash{background:#ffd600;color:#000;border-color:#ffd600}
#varbar #varplay.activo{background:#2e7d32;border-color:#66bb6a;box-shadow:0 0 14px #43a047}
#varbar #varatras.activo{background:#1565c0;border-color:#64b5f6;box-shadow:0 0 14px #1e88e5}
#varbar #varpausa.activo{background:#c62828;border-color:#ef5350;box-shadow:0 0 14px #e53935}
#varbar button.on{background:#fff;color:#000}
#varbar #varpos{font-size:24px}
@media (max-width:1240px){#varbar.pos-arriba,#varbar.pos-abajo{gap:6px;padding:8px 10px}#varbar.pos-arriba button,#varbar.pos-abajo button{padding:14px 13px;min-width:58px}#varbar.pos-arriba b,#varbar.pos-abajo b{margin:0 2px}}
#marco{overflow:hidden}
body.zoomvar #v{transform-origin:0 0;will-change:transform;cursor:grab}
body.zoomvar #marco{touch-action:none;-webkit-user-select:none;user-select:none}
body.zoomvar #v:active{cursor:grabbing}
#lapiz{position:absolute;inset:0;width:100%;height:100%;z-index:3;touch-action:none;cursor:crosshair}
#lapiz[hidden],#mapa[hidden]{display:none}
#lapiz.mirar{pointer-events:none;cursor:default}
#mapa{position:absolute;left:10px;bottom:64px;width:200px;border:2px solid rgba(255,255,255,.7);border-radius:8px;overflow:hidden;z-index:4;background:#000;box-shadow:0 6px 20px rgba(0,0,0,.6);pointer-events:none}
#mapa canvas{display:block;width:100%}
#maparect{position:absolute;border:2px solid #ffd600;box-shadow:0 0 0 999px rgba(0,0,0,.35)}
#mapaz{position:absolute;right:4px;top:4px;background:#ffd600;color:#000;font:800 13px system-ui,sans-serif;padding:2px 6px;border-radius:6px}
#varbar:not(.conher) .her{display:none}
#varbar #vartools.aviso{background:#ffd600;color:#000;border-color:#ffd600}
#varbar.conher #vartools{background:#fff;color:#000}
#varbar #varlapiz.activo{background:#ff6f00;border-color:#ffb74d;box-shadow:0 0 14px #ff9800}
#varbar.pos-izq #vartools,#varbar.pos-der #vartools{order:11;grid-column:span 2}#varbar.pos-izq #varzin,#varbar.pos-der #varzin{order:12}#varbar.pos-izq #varzout,#varbar.pos-der #varzout{order:13}
#varbar.pos-izq #varz1,#varbar.pos-der #varz1{order:14}#varbar.pos-izq #varlapiz,#varbar.pos-der #varlapiz{order:15}
#varbar.pos-izq #varborrar,#varbar.pos-der #varborrar{order:16;grid-column:span 2}
@media (orientation:landscape) and (max-height:520px){#varbar{padding:6px 8px;gap:5px}#varbar.pos-arriba{top:4px}#varbar.pos-abajo{bottom:52px}#varbar button{padding:10px 12px;font-size:18px;min-width:46px}#varbar b{font-size:14px}#varbar.pos-izq,#varbar.pos-der{grid-template-columns:repeat(3,auto);max-height:calc(100% - 64px);gap:5px;padding:6px}#varbar.pos-izq b,#varbar.pos-der b{grid-column:span 3}#varbar.pos-izq #varpausa,#varbar.pos-der #varpausa{order:1;grid-column:auto}#varbar.pos-izq #varvivo,#varbar.pos-der #varvivo{grid-column:span 2}#varbar.pos-izq #varpos,#varbar.pos-der #varpos{grid-column:auto}#varbar.pos-izq button,#varbar.pos-der button{padding:8px 9px;font-size:17px;min-width:46px}#mapa{width:130px;bottom:52px}#varbar.pos-izq #varborrar,#varbar.pos-der #varborrar{grid-column:auto}}
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
<button id="apptv" class="ico" title="Ver en la app de TV" aria-label="Ver en la app de TV"><svg viewBox="0 0 24 24"><path d="M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z"/></svg></button>
<button id="bajar" class="ico" hidden title="Descargar el video" aria-label="Descargar el video"><svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg></button>
<div id="aviso" hidden></div>
</div>
<div id="desc" hidden></div>
<div id="vbar" hidden><button id="vbpp" aria-label="Reproducir o pausar">❚❚</button><input id="vbpos" type="range" min="0" max="100" step="0.04" value="0" aria-label="Posición"><span id="vbt">0:00</span><button id="vbmute" aria-label="Sonido">🔊</button><button id="vbpc" aria-label="Pantalla completa">⛶</button></div>
<div id="varbar" hidden class="pos-arriba"><b>VAR</b><button data-s="-2" title="Atrás 2 s (←)">‹2s</button><button data-f="-1" title="Cuadro anterior (,)">‹|</button><button id="varatras" class="modo" title="Reproducir hacia atrás (J)">◀</button><button id="varpausa" class="modo" title="Pausa (espacio)">❚❚</button><button id="varplay" class="modo" title="Reproducir (L)">▶</button><button data-f="1" title="Cuadro siguiente (.)">|›</button><button data-s="2" title="Adelante 2 s (→)">2s›</button><button id="varvel" title="Velocidad">1x</button><button id="varvivo" title="Volver al vivo">● VIVO</button><button id="vartools" title="Herramientas: zoom y lápiz">🛠 ▾</button><button id="varzin" class="her" title="Acercar (rueda del mouse / pellizco)">🔍+</button><button id="varzout" class="her" title="Alejar">🔍−</button><button id="varz1" class="her" title="Ver la imagen entera">⟲</button><button id="varlapiz" class="her" title="Lápiz: marcar sobre la imagen">✏️</button><button id="varborrar" class="her" title="Borrar las marcas">🧽</button><button id="varpos" title="Mover la barra: arriba, derecha, abajo, izquierda">✥</button></div>
<canvas id="lapiz" hidden></canvas><div id="mapa" hidden><canvas id="mapac"></canvas><i id="maparect"></i><span id="mapaz">1x</span></div>
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
 var antesVar=modoVar;modoVar=!!d.var;varbar.hidden=!(modoVar&&(d.estado==='vivo'||d.estado==='repeticion'||d.estado==='grabado'));usarControlesPropios(!varbar.hidden);zoomVar(!varbar.hidden);if(!varbar.hidden)marcarModo();if(modoVar&&!antesVar){actual=null}
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
var varModo='pausa',atrasT=null,POS=['pos-arriba','pos-der','pos-abajo','pos-izq'];
function marcarModo(){['varplay','varatras','varpausa'].forEach(function(id){document.getElementById(id).classList.toggle('activo',(id==='varplay'&&varModo==='adelante')||(id==='varatras'&&varModo==='atras')||(id==='varpausa'&&varModo==='pausa'))})}
function pararAtras(){if(atrasT){clearInterval(atrasT);atrasT=null}}
function haciaAtras(){if(lapizOn)lapizModo(false);borrarMarcas();pararAtras();v.pause();varModo='atras';marcarModo();var paso=0.12;
 atrasT=setInterval(function(){var ini=rango()[0];var t=v.currentTime-paso*v.playbackRate;if(t<=ini+0.05){try{v.currentTime=ini}catch(e){}pausar();return}if(!v.seeking){try{v.currentTime=t}catch(e){}}},120)}
function adelante(){if(lapizOn)lapizModo(false);borrarMarcas();pararAtras();varModo='adelante';marcarModo();reproducir()}
function pausar(){pararAtras();v.pause();varModo='pausa';marcarModo()}
function destello(b){b.classList.add('flash');setTimeout(function(){b.classList.remove('flash')},280)}
v.addEventListener('play',function(){if(modoVar&&!atrasT){varModo='adelante';marcarModo()}});
v.addEventListener('pause',function(){if(modoVar&&!atrasT){varModo='pausa';marcarModo()}});
function posBarra(c){var her=varbar.classList.contains('conher');varbar.className=c;if(her)varbar.classList.add('conher')}
function posActual(){for(var i=0;i<POS.length;i++)if(varbar.classList.contains(POS[i]))return i;return 0}
try{var pg=localStorage.getItem('varpos');if(POS.indexOf(pg)>=0)varbar.className=pg;if(localStorage.getItem('varher')==='1')varbar.classList.add('conher')}catch(e){}
varbar.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
 if(b.dataset.s){destello(b);varMover(Number(b.dataset.s));return}
 if(b.dataset.f){destello(b);pausar();varMover(Number(b.dataset.f)/30);return}
 if(b.id==='varplay'){adelante();return}
 if(b.id==='varatras'){haciaAtras();return}
 if(b.id==='varpausa'){pausar();return}
 if(b.id==='vartools'){var on=varbar.classList.toggle('conher');b.textContent=on?'🛠 ▴':'🛠 ▾';try{localStorage.setItem('varher',on?'1':'0')}catch(e){}avisoTools();return}
 if(b.id==='varzin'){destello(b);zoomCentro(1.5);return}
 if(b.id==='varzout'){destello(b);zoomCentro(1/1.5);return}
 if(b.id==='varz1'){destello(b);Z.z=1;aplicarZ();return}
 if(b.id==='varlapiz'){lapizModo(!lapizOn);return}
 if(b.id==='varborrar'){destello(b);borrarMarcas();return}
 if(b.id==='varpos'){destello(b);var i=(posActual()+1)%POS.length;posBarra(POS[i]);try{localStorage.setItem('varpos',POS[i])}catch(e){}return}
 if(b.id==='varvel'){var r=v.playbackRate===1?0.5:v.playbackRate===0.5?0.25:1;v.playbackRate=r;velBtn.textContent=(r===1?'1':r)+'x';velBtn.className=r===1?'':'on';return}
 if(b.id==='varvivo'){destello(b);pararAtras();v.playbackRate=1;velBtn.textContent='1x';velBtn.className='';
  if(hls&&hls.liveSyncPosition){v.currentTime=hls.liveSyncPosition}else if(v.seekable&&v.seekable.length){v.currentTime=v.seekable.end(v.seekable.length-1)-3}adelante()}});
document.addEventListener('keydown',function(e){if(!modoVar||/input|textarea/i.test(e.target.tagName))return;
 if(e.key==='ArrowLeft'){varMover(-2);e.preventDefault()}else if(e.key==='ArrowRight'){varMover(2);e.preventDefault()}
 else if(e.key===','){pausar();varMover(-1/30)}else if(e.key==='.'){pausar();varMover(1/30)}
 else if(e.key==='j'||e.key==='J'){haciaAtras()}else if(e.key==='l'||e.key==='L'){adelante()}else if(e.key==='k'||e.key==='K'){pausar()}
 else if(e.key===' '){if(varModo==='pausa')adelante();else pausar();e.preventDefault()}
 else if(e.key==='+'||e.key==='='){zoomCentro(1.5)}else if(e.key==='-'){zoomCentro(1/1.5)}else if(e.key==='0'){Z.z=1;aplicarZ()}
 else if(e.key==='d'||e.key==='D'){lapizModo(!lapizOn)}else if(e.key==='Escape'){borrarMarcas();if(lapizOn)lapizModo(false)}});
/* Zoom (pellizco, rueda, doble toque) y lápiz del VAR */
var Z={z:1,x:0,y:0},ZMAX=6,punteros={},pinch=null,arr=null,toque=0,marcoEl=document.getElementById('marco');
var lapiz=document.getElementById('lapiz'),lctx=lapiz.getContext('2d'),dibujando=false,lapizOn=false,trazos=false;
var mapa=document.getElementById('mapa'),mapac=document.getElementById('mapac'),mctx=mapac.getContext('2d'),maparect=document.getElementById('maparect'),mapaz=document.getElementById('mapaz'),mapaT=null;
function caja(){return marcoEl.getBoundingClientRect()}
function aplicarZ(){var c=caja();Z.z=Math.min(ZMAX,Math.max(1,Z.z));if(Z.z===1){Z.x=0;Z.y=0}
 Z.x=Math.min(0,Math.max(c.width-c.width*Z.z,Z.x));Z.y=Math.min(0,Math.max(c.height-c.height*Z.z,Z.y));
 v.style.transform=Z.z===1?'':'translate('+Z.x+'px,'+Z.y+'px) scale('+Z.z+')';
 mapa.hidden=Z.z===1;mapaz.textContent=(Math.round(Z.z*10)/10)+'x';
 if(hls&&hls.levels&&hls.levels.length){var alta=Z.z>1?hls.levels.length-1:-1;if(hls.currentLevel!==alta&&(Z.z>1||hls.autoLevelEnabled===false))hls.currentLevel=alta}
 if(Z.z>1){if(!mapaT)mapaT=setInterval(pintarMapa,200);pintarMapa()}else{clearInterval(mapaT);mapaT=null}
 if(trazos)redibujar();avisoTools()}
function zoomEn(px,py,nz){var z0=Z.z;nz=Math.min(ZMAX,Math.max(1,nz));Z.x=px-(px-Z.x)*(nz/z0);Z.y=py-(py-Z.y)*(nz/z0);Z.z=nz;aplicarZ()}
function zoomCentro(f){var c=caja();zoomEn(c.width/2,c.height/2,Z.z*f)}
function zoomToggle(e){var c=caja();if(Z.z>1){Z.z=1;aplicarZ()}else{zoomEn(e.clientX-c.left,e.clientY-c.top,2.5)}}
function pintarMapa(){var c=caja();var w=200,h=Math.round(w*c.height/c.width);if(mapac.width!==w){mapac.width=w;mapac.height=h}
 try{var vw=v.videoWidth||16,vh=v.videoHeight||9,esc=Math.min(w/vw,h/vh);mctx.fillStyle='#000';mctx.fillRect(0,0,w,h);mctx.drawImage(v,(w-vw*esc)/2,(h-vh*esc)/2,vw*esc,vh*esc)}catch(e){}
 var mw=mapa.clientWidth/c.width;maparect.style.left=(-Z.x/Z.z*mw)+'px';maparect.style.top=(-Z.y/Z.z*mw)+'px';maparect.style.width=(c.width/Z.z*mw)+'px';maparect.style.height=(c.height/Z.z*mw)+'px'}
function fueraDeVideo(t){return !!(t&&t.closest&&t.closest('#varbar,#vbar,#acciones,#mapa,#desc,#partes,#msg,#aviso'))}
marcoEl.addEventListener('wheel',function(e){if(!modoVar||fueraDeVideo(e.target))return;e.preventDefault();var c=caja();zoomEn(e.clientX-c.left,e.clientY-c.top,Z.z*Math.exp(-e.deltaY*0.0018))},{passive:false});
function zDown(e){punteros[e.pointerId]={x:e.clientX,y:e.clientY};try{(e.target&&e.target.setPointerCapture?e.target:marcoEl).setPointerCapture(e.pointerId)}catch(x){}
 var ids=Object.keys(punteros);
 if(ids.length===2){var a=punteros[ids[0]],b=punteros[ids[1]];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:Z.z,mx:(a.x+b.x)/2,my:(a.y+b.y)/2,x:Z.x,y:Z.y};arr=null}
 else if(ids.length===1){arr={x:e.clientX,y:e.clientY,zx:Z.x,zy:Z.y,t:Date.now()}}}
marcoEl.addEventListener('pointerdown',function(e){if(!modoVar||e.target===lapiz||fueraDeVideo(e.target))return;zDown(e)});
function zMove(e){if(!punteros[e.pointerId])return;punteros[e.pointerId]={x:e.clientX,y:e.clientY};var c=caja();
 if(pinch){var ids=Object.keys(punteros);if(ids.length<2)return;var a=punteros[ids[0]],b=punteros[ids[1]];var d=Math.hypot(a.x-b.x,a.y-b.y);var mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  var nz=Math.min(ZMAX,Math.max(1,pinch.z*d/pinch.d));var px=pinch.mx-c.left,py=pinch.my-c.top;
  Z.x=px-(px-pinch.x)*(nz/pinch.z)+(mx-pinch.mx);Z.y=py-(py-pinch.y)*(nz/pinch.z)+(my-pinch.my);Z.z=nz;aplicarZ();return}
 if(arr&&Z.z>1){Z.x=arr.zx+(e.clientX-arr.x);Z.y=arr.zy+(e.clientY-arr.y);aplicarZ()}}
marcoEl.addEventListener('pointermove',function(e){if(!modoVar||e.target===lapiz)return;zMove(e)});
function soltar(e){if(!punteros[e.pointerId])return;delete punteros[e.pointerId];
 if(Object.keys(punteros).length<2)pinch=null;
 if(e.pointerType!=='mouse'&&arr&&Object.keys(punteros).length===0){var quieto=Math.hypot(e.clientX-arr.x,e.clientY-arr.y)<12&&Date.now()-arr.t<300;
  if(quieto){if(Date.now()-toque<350){zoomToggle(e);toque=0}else toque=Date.now()}}
 if(!Object.keys(punteros).length)arr=null}
['pointerup','pointercancel'].forEach(function(n){marcoEl.addEventListener(n,function(e){if(e.target===lapiz)return;soltar(e)})});
/* Que el navegador no agrande la página entera con el pellizco (iPad ignora touch-action) */
marcoEl.addEventListener('touchmove',function(e){if(modoVar&&!fueraDeVideo(e.target)&&(e.touches.length>1||Z.z>1||lapizOn))e.preventDefault()},{passive:false});
['gesturestart','gesturechange','gestureend'].forEach(function(n){document.addEventListener(n,function(e){if(modoVar)e.preventDefault()},{passive:false})});
window.addEventListener('resize',function(){if(Z.z>1)aplicarZ();medirLapiz()});
document.addEventListener('fullscreenchange',function(){setTimeout(function(){aplicarZ();medirLapiz()},200)});
/* Lápiz */
var marcas=[],trazo=null;
function medirLapiz(){var c=caja(),r=window.devicePixelRatio||1;if(!c.width)return;lapiz.width=Math.round(c.width*r);lapiz.height=Math.round(c.height*r);lctx.setTransform(r,0,0,r,0,0);redibujar()}
function aImagen(e){var c=caja();return{x:((e.clientX-c.left)-Z.x)/Z.z/c.width,y:((e.clientY-c.top)-Z.y)/Z.z/c.height}}
function aPantalla(p){var c=caja();return{x:p.x*c.width*Z.z+Z.x,y:p.y*c.height*Z.z+Z.y}}
function redibujar(){var r=window.devicePixelRatio||1;lctx.setTransform(1,0,0,1,0,0);lctx.clearRect(0,0,lapiz.width,lapiz.height);lctx.setTransform(r,0,0,r,0,0);
 var g=Math.min(2.2,Math.sqrt(Z.z));lctx.lineCap='round';lctx.lineJoin='round';
 marcas.concat(trazo?[trazo]:[]).forEach(function(t){if(!t.length)return;var q=t.map(aPantalla);
  [['rgba(0,0,0,.6)',12*g],['#ffd600',6*g]].forEach(function(c){lctx.beginPath();lctx.moveTo(q[0].x,q[0].y);for(var i=1;i<q.length;i++)lctx.lineTo(q[i].x,q[i].y);if(q.length===1)lctx.lineTo(q[0].x+0.1,q[0].y);lctx.strokeStyle=c[0];lctx.lineWidth=c[1];lctx.stroke()})})}
function lapizModo(si){lapizOn=si;setTimeout(avisoTools,0);document.getElementById('varlapiz').classList.toggle('activo',si);
 if(si){medirLapiz();lapiz.hidden=false;lapiz.classList.remove('mirar');pausar()}else{lapiz.classList.add('mirar');lapiz.hidden=!trazos}}
function borrarMarcas(){marcas=[];trazo=null;trazos=false;redibujar();avisoTools();if(!lapizOn)lapiz.hidden=true}
var lp={};
lapiz.addEventListener('pointerdown',function(e){if(!lapizOn)return;e.stopPropagation();lp[e.pointerId]=1;try{lapiz.setPointerCapture(e.pointerId)}catch(x){}
 var n=Object.keys(lp).length;
 if(n===1){dibujando=true;trazos=true;trazo=[aImagen(e)];redibujar();arr=null;punteros={};punteros[e.pointerId]={x:e.clientX,y:e.clientY}}
 if(n>=2){/* segundo dedo: deja de dibujar y pasa a zoom */dibujando=false;trazo=null;redibujar();zDown(e)}});
lapiz.addEventListener('pointermove',function(e){if(!lp[e.pointerId])return;if(dibujando){trazo.push(aImagen(e));redibujar();return}zMove(e)});
['pointerup','pointercancel'].forEach(function(n){lapiz.addEventListener(n,function(e){if(!lp[e.pointerId])return;delete lp[e.pointerId];
 if(dibujando&&trazo&&trazo.length){marcas.push(trazo)}trazo=null;dibujando=false;
 delete punteros[e.pointerId];if(Object.keys(punteros).length<2)pinch=null;if(!Object.keys(punteros).length)arr=null})});
/* Las marcas son de la imagen quieta: si la imagen se mueve, se borran */
v.addEventListener('play',function(){if(trazos&&!lapizOn)borrarMarcas()});
v.addEventListener('seeking',function(){if(trazos&&!lapizOn&&!atrasT)borrarMarcas()});
function avisoTools(){var t=document.getElementById('vartools');if(!t)return;t.classList.toggle('aviso',!varbar.classList.contains('conher')&&(Z.z>1||lapizOn||trazos));t.textContent=varbar.classList.contains('conher')?'🛠 ▴':'🛠 ▾'}
function zoomVar(si){document.body.classList.toggle('zoomvar',si);if(!si){Z.z=1;aplicarZ();lapizModo(false);borrarMarcas()}}
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
v.addEventListener('dblclick',function(e){if(modoVar){zoomToggle(e);return}pcBtn.click()});
/* Controles propios (modo VAR): así la pantalla completa nunca es la del sistema y la barra VAR queda siempre a la vista */
var vbar=document.getElementById('vbar'),vbpos=document.getElementById('vbpos'),vbt=document.getElementById('vbt'),vbpp=document.getElementById('vbpp'),vbmute=document.getElementById('vbmute'),arrastrando=false;
function rango(){var sk=v.seekable;if(sk&&sk.length){return[sk.start(0),sk.end(sk.length-1)]}return[0,isFinite(v.duration)?v.duration:0]}
function mmss(t){t=Math.max(0,Math.round(t));var h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;return(h?h+':'+(m<10?'0':''):'')+m+':'+(x<10?'0':'')+x}
function pintar(){if(!modoVar)return;var r=rango();vbpos.min=r[0];vbpos.max=r[1]||1;if(!arrastrando)vbpos.value=v.currentTime;
 vbt.textContent=ultimo==='vivo'?(r[1]-v.currentTime>8?'-'+mmss(r[1]-v.currentTime):'EN VIVO'):mmss(v.currentTime)+' / '+mmss(r[1]);vbpp.textContent=v.paused?'▶':'❚❚';vbmute.textContent=v.muted?'🔇':'🔊'}
['timeupdate','play','pause','durationchange','progress','volumechange'].forEach(function(n){v.addEventListener(n,pintar)});
vbpos.addEventListener('input',function(){if(atrasT)pausar();arrastrando=true;vbt.textContent=mmss(vbpos.value)});
vbpos.addEventListener('change',function(){arrastrando=false;try{v.currentTime=Number(vbpos.value)}catch(e){}});
vbpp.onclick=function(){if(atrasT||!v.paused)pausar();else adelante()};
vbmute.onclick=function(){v.muted=!v.muted;sonido.hidden=true};
document.getElementById('vbpc').onclick=function(){pcBtn.click()};
function usarControlesPropios(si){v.controls=!si;vbar.hidden=!si;if(si)pintar()}
var bajar=document.getElementById('bajar'),desc=document.getElementById('desc');
document.getElementById('apptv').onclick=function(){var c=cajaDesc();c.querySelector('h3').textContent='Ver en la app de TV';
 var p=document.createElement('p');p.innerHTML='Abrí la app <b>TicketGo</b> en el televisor y escribí acá el <b>número de 4 cifras</b> que aparece.';c.appendChild(p);
 var f=document.createElement('div');f.style.cssText='display:flex;gap:8px;margin-top:8px';
 var i=document.createElement('input');i.inputMode='numeric';i.maxLength=4;i.placeholder='0000';i.style.cssText='flex:1;font:700 22px system-ui;letter-spacing:6px;text-align:center;padding:8px;border-radius:8px;border:1px solid #444;background:#111;color:#fff;min-width:0';
 var b=document.createElement('button');b.className='btn';b.textContent='Enviar';f.appendChild(i);f.appendChild(b);c.appendChild(f);
 var r=document.createElement('p');c.appendChild(r);
 var a=document.createElement('p');a.style.fontSize='12px';a.innerHTML='¿No tenés la app? En Android TV / Google TV / Fire TV instalá <b>Downloader</b> y escribí <b>ticketgoplus.com/app</b>.';c.appendChild(a);
 setTimeout(function(){i.focus()},50);
 b.onclick=function(){var n=i.value.replace(/\D/g,'');if(n.length!==4){r.textContent='Son 4 números.';return}b.disabled=true;r.textContent='Enviando…';
  fetch('/tv/api/vincular',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numero:n,t:T}),cache:'no-store'}).then(function(x){return x.json()}).then(function(d){b.disabled=false;
   if(d.ok){r.innerHTML='<b>¡Listo!</b> Mirá la TV: arranca en unos segundos.';try{v.pause()}catch(e){}}else{r.textContent=d.error||'No se pudo.'}}).catch(function(){b.disabled=false;r.textContent='Sin conexión, probá de nuevo.'})}};
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
