"use strict";
/* game.js — lógica, dibujo y controles.
   Usa VERBS, que viene de verbs.js (debe cargarse primero). */

/* ============ 1. CONFIGURACIÓN ============ */
const MAZE=[
"###################",
"#        #        #",
"# ## ### # ### ## #",
"#                 #",
"# ## # ##### # ## #",
"#    #   #   #    #",
"#### ### # ### ####",
"#                 #",
"#### ### # ### ####",
"#    #   #   #    #",
"# ## # ##### # ## #",
"#                 #",
"# ## ### # ### ## #",
"#        #        #",
"###################"];

const COLS=19,ROWS=15,T=32,TOTAL=20;              // 20 preguntas por partida clásica
const TIERS={easy:"A",med:"AB",hard:"ABC"};

const CFG={
  easy:{kinds:["wander","chase"],speed:2.6,err:.35,mult:1,qtime:20},
  med:{kinds:["chase","ambush","wander"],speed:3.3,err:.2,mult:1.5,qtime:15},
  hard:{kinds:["chase","ambush","chase","wander"],speed:4,err:.1,mult:2,qtime:10}};

const CORNERS=[[1,1],[17,1],[1,13],[17,13]],COLORS=["#ff3b3b","#ff8de1","#38e1ff","#ffa53b"];
const DIRS=[[-1,0],[1,0],[0,-1],[0,1]],PSPEED=5;
const ICON={freeze:"⭐",gem:"💎",heart:"❤️"};

const $=id=>document.getElementById(id);
const cv=$("cv"),ctx=cv.getContext("2d");

const DPR=Math.min(window.devicePixelRatio||1,2);
cv.width=COLS*T*DPR;cv.height=ROWS*T*DPR;ctx.scale(DPR,DPR);

const free=(c,r)=>r>=0&&r<ROWS&&c>=0&&c<COLS&&MAZE[r][c]===" ";
const FREE=[];MAZE.forEach((row,r)=>{for(let c=0;c<COLS;c++)if(row[c]===" ")FREE.push({c,r});});
const rnd=n=>Math.floor(Math.random()*n);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const md=(a,b)=>Math.abs(a.c-b.c)+Math.abs(a.r-b.r);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);
    this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this;};
}

/* ============ 2. TOASTS Y CONFIRMACIONES ============ */
function toast(msg,kind="info",dur=2200){
  const box=$("toasts");
  if(!box)return;
  while(box.children.length>=3)box.removeChild(box.firstChild);
  const el=document.createElement("div");
  el.className="toast "+kind;
  el.textContent=msg;
  box.appendChild(el);
  setTimeout(()=>{
    el.classList.add("out");
    el.addEventListener("animationend",()=>el.remove(),{once:true});
  },dur);
}
function clearToasts(){const box=$("toasts");if(box)box.innerHTML="";}

function ask(o){
  return new Promise(res=>{
    $("mIco").textContent=o.ico||"❓";
    $("mTitle").textContent=o.title||"¿Seguro?";
    $("mText").textContent=o.text||"";
    const yes=$("mYes"),no=$("mNo");
    yes.textContent=o.yes||"Sí";
    no.textContent=o.no||"Cancelar";
    yes.className=o.danger?"danger":"go";
    $("modal").style.display="flex";
    no.focus();
    const key=e=>{if(e.key==="Escape"){e.stopPropagation();close(false);}};
    const close=v=>{
      $("modal").style.display="none";
      document.removeEventListener("keydown",key,true);
      res(v);
    };
    yes.onclick=()=>close(true);
    no.onclick=()=>close(false);
    document.addEventListener("keydown",key,true);
  });
}

/* ============ 3. MEMORIA INTELIGENTE ============ */
let STATS={};
try{STATS=JSON.parse(localStorage.getItem("pv-smart"))||{};}catch(e){}
function saveStats(){try{localStorage.setItem("pv-smart",JSON.stringify(STATS));}catch(e){}}
function noteResult(v,ok){const s=STATS[v.inf]||(STATS[v.inf]={s:0,f:0});s.s++;if(!ok)s.f++;saveStats();}
function weightedDeck(base){
  const arr=[];
  for(const v of base){
    const f=(STATS[v.inf]&&STATS[v.inf].f)||0;
    const n=1+Math.min(f,3);
    for(let i=0;i<n;i++)arr.push(v);
  }
  return shuffle(arr);
}

let S=null,PAUSED=false,STUDY=[];

const walls=document.createElement("canvas");
walls.width=cv.width;walls.height=cv.height;
{
  const w=walls.getContext("2d");w.scale(DPR,DPR);
  w.fillStyle="#0a0a3a";w.strokeStyle="#3a5bff";w.lineWidth=2;
  w.shadowColor="#3a5bff";w.shadowBlur=8;
  MAZE.forEach((row,r)=>[...row].forEach((ch,c)=>{
    if(ch==="#"){w.beginPath();w.roundRect(c*T+2,r*T+2,T-4,T-4,7);w.fill();w.stroke();}
  }));
  w.shadowBlur=0;w.fillStyle="rgba(255,255,255,.06)";
  FREE.forEach(f=>{w.beginPath();w.arc(f.c*T+T/2,f.r*T+T/2,2,0,7);w.fill();});
}

/* ============ 4. SONIDO: EFECTOS ============ */
let AC=null,sound=true;
try{sound=localStorage.getItem("pv-sound")!=="0";}catch(e){}

function unlockAudio(){
  try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();
      if(AC.state==="suspended")AC.resume();}catch(e){}}

function beep(f,d=.12,type="square",when=0){
  if(!sound)return;
  try{unlockAudio();
    const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime+when;
    o.type=type;o.frequency.value=f;
    g.gain.setValueAtTime(.06,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
    o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+d);
  }catch(e){}}

function jingle(seq){seq.forEach(([f,d,w,ty])=>beep(f,d,ty||"square",w||0));}

function say(t){
  if(!sound||!window.speechSynthesis)return;
  const u=new SpeechSynthesisUtterance(t);u.lang="en-US";u.rate=.85;
  const v=speechSynthesis.getVoices().find(v=>/^en([-_]|$)/i.test(v.lang));
  if(v)u.voice=v;
  speechSynthesis.cancel();speechSynthesis.speak(u);
}

function toggleSound(){
  sound=!sound;
  try{localStorage.setItem("pv-sound",sound?"1":"0");}catch(e){}
  const a=$("snd"),b=$("sndMenu");
  if(a)a.textContent=sound?"🔊":"🔇";
  if(b)b.textContent=sound?"🔊 Sonido activado":"🔇 Sonido apagado";
  if(sound){beep(880,.08);if(onMenu()&&!musicUserOff&&hadGesture)startMusic();}
  else stopMusic();
}

/* ============ 5. SONIDO: MUSIQUITA CHIPTUNE DEL MENÚ ============ */
const N=n=>440*Math.pow(2,(n-69)/12);
const STEP=.21;
const MELODY=[76,79,81,79,76,72,74,76,
              77,81,79,77,76,74,72,74,
              76,79,81,84,83,79,81,79,
              77,76,74,71,72,0,0,0];
const BASS=[48,48,43,43,41,41,43,43,
            48,48,45,45,41,43,48,48];

let musicOn=false,musicUserOff=false,hadGesture=false;
let musicGain=null,musicTimer=null,musicStep=0,nextNoteTime=0;
try{musicUserOff=localStorage.getItem("pv-music")==="0";}catch(e){}

function noteAt(midi,t,d,type,vol){
  const o=AC.createOscillator(),g=AC.createGain();
  o.type=type;o.frequency.value=N(midi);
  g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(g);g.connect(musicGain);
  o.start(t);o.stop(t+d+.02);
}
function musicTick(){
  if(!AC||!musicGain)return;
  while(nextNoteTime<AC.currentTime+.3){
    const i=musicStep%32,m=MELODY[i];
    if(m)noteAt(m,nextNoteTime,.19,"square",.025);
    if(i%2===0){const b=BASS[i/2];if(b)noteAt(b,nextNoteTime,.38,"triangle",.04);}
    nextNoteTime+=STEP;musicStep++;
  }
}
function startMusic(){
  if(musicOn||!sound)return;
  unlockAudio();if(!AC)return;
  musicGain=AC.createGain();musicGain.gain.value=1;musicGain.connect(AC.destination);
  musicOn=true;musicStep=0;nextNoteTime=AC.currentTime+.1;
  musicTimer=setInterval(musicTick,100);
  updateMusicBtn();
}
function stopMusic(){
  musicOn=false;
  if(musicTimer){clearInterval(musicTimer);musicTimer=null;}
  if(musicGain&&AC){const g=musicGain;
    g.gain.setTargetAtTime(0,AC.currentTime,.06);
    setTimeout(()=>{try{g.disconnect();}catch(e){}},400);
    musicGain=null;}
  updateMusicBtn();
}
function toggleMusic(){
  if(musicOn){musicUserOff=true;stopMusic();}
  else{musicUserOff=false;startMusic();}
  try{localStorage.setItem("pv-music",musicUserOff?"0":"1");}catch(e){}
}
function updateMusicBtn(){
  const b=$("musBtn");
  if(b)b.textContent=musicOn?"🎵 Música: sonando":"🎵 Música: apagada";
}
const onMenu=()=>!$("menuScreen").hidden;
function gestureOnce(){
  hadGesture=true;
  if(onMenu()&&!musicUserOff)startMusic();
}
addEventListener("pointerdown",gestureOnce,{once:true});
addEventListener("keydown",gestureOnce,{once:true});

/* ============ 6. ACTORES Y MOVIMIENTO ============ */
const mk=(c,r)=>({c,r,tc:c,tr:r,t:1,dx:0,dy:0,x:c,y:r});

function step(a,speed,dt,pick){
  a.t+=speed*dt;
  let guard=0;
  while(a.t>=1&&guard++<4){
    a.t-=1;a.c=a.tc;a.r=a.tr;
    const d=pick(a);a.dx=d[0];a.dy=d[1];
    if(free(a.c+a.dx,a.r+a.dy)){a.tc=a.c+a.dx;a.tr=a.r+a.dy;}
    else{a.tc=a.c;a.tr=a.r;a.dx=a.dy=0;a.t=1;break;}
  }
  a.x=a.c+(a.tc-a.c)*a.t;a.y=a.r+(a.tr-a.r)*a.t;
}

const pickPlayer=a=>{const w=S.want;return(w&&free(a.c+w[0],a.r+w[1]))?w:[a.dx,a.dy];};

function pickGhost(g){
  let o=DIRS.filter(d=>free(g.c+d[0],g.r+d[1])&&!(d[0]===-g.dx&&d[1]===-g.dy));
  if(!o.length)o=[[-g.dx,-g.dy]];
  const P=S.pl;let tx=P.c,ty=P.r;
  if(g.kind==="ambush"){tx+=P.dx*3;ty+=P.dy*3;}
  if(g.kind==="wander"||Math.random()<g.err)return o[rnd(o.length)];
  const dist=d=>(g.c+d[0]-tx)**2+(g.r+d[1]-ty)**2;
  return o.sort((a,b)=>dist(a)-dist(b))[0];
}

/* ============ 7. PANTALLAS ============ */
function menu(){
  S=null;PAUSED=false;
  try{speechSynthesis.cancel();}catch(e){}
  $("gameScreen").hidden=true;
  $("menuScreen").hidden=false;
  $("ov").style.display="none";
  clearToasts();refreshMenuStats();
  if(hadGesture&&!musicUserOff)startMusic();
}
function refreshMenuStats(){
  let b=0,br=0,g=0;
  try{
    b=+localStorage.getItem("pv-best")||0;
    br=+localStorage.getItem("pv-best-rush")||0;   // récord aparte del modo Contrarreloj
    g=+localStorage.getItem("pv-games")||0;
  }catch(e){}
  const mast=VERBS.filter(v=>{const t=STATS[v.inf];return t&&t.s>=3&&!t.f;}).length;
  const eb=$("best");if(eb)eb.textContent=br>b?`${b} · ⏱${br}`:b;   // muestra los dos si el de rush es mejor
  const eg=$("games");if(eg)eg.textContent=g;
  const em=$("mast");if(em)em.textContent=mast+"/"+VERBS.length;
}

function howTo(){
  $("box").innerHTML=`
    <h2>❓ Cómo se juega</h2>
    <div class="demo" aria-hidden="true">
      <div class="pac small"></div>
      <div class="pill">went</div>
      <div class="ghosts small"><span>👻</span><span>👻</span></div>
    </div>
    <ul class="how">
      <li>🕹️ <b>Muévete</b> con las flechas / WASD o deslizando el dedo.</li>
      <li>🍬 La pregunta aparece arriba: <b>cómete la pastilla con la forma correcta</b> del verbo.</li>
      <li>👻 Esquiva a los fantasmas. Si te tocan, si fallas o si se acaba la barra ⏱: <b>-1 ❤️</b>.</li>
      <li>⭐ <b>congela</b> fantasmas · 💎 <b>puntos x2</b> · ❤️ <b>vida extra</b> — aparecen con tus rachas.</li>
      <li>🔥 Las rachas multiplican puntos y cada 5 preguntas <b>¡sube la presión!</b></li>
      <li>⏱ <b>Contrarreloj</b>: 60 s. Acierto +2 s, fallo −5 s, fantasma −5 s, jefe −8 s.</li>
      <li>👹 <b>Jefe final</b>: aparece al subir la presión (o a mitad del contrarreloj). Solo ⭐ lo detiene.</li>
      <li>🧠 El juego recuerda tus fallos y te los repite: perfecto para memorizar.</li>
    </ul>
    <button class="go" onclick="closeHow()">¡Entendido!</button>`;
  $("ov").style.display="flex";
}
function closeHow(){$("ov").style.display="none";}

/* ============ 8. LÓGICA DEL JUEGO ============ */
function start(pool,level,mode){
  unlockAudio();clearToasts();stopMusic();
  level=level||($("lvl")?$("lvl").value:"easy");
  mode=mode||($("mode")?$("mode").value:"past");
  S={level,mode,run:true,
     score:0,lives:3,streak:0,maxStreak:0,correct:0,answered:0,q:0,deck:[],
     pool:pool||null,
     total:mode==="rush"?999:(pool?clamp(pool.length*3,5,TOTAL):TOTAL),
     want:null,ang:0,freeze:0,double:0,inv:2,
     qt:CFG[level].qtime,lastTick:99,heat:0,
     rt:60,rtShown:60,                              // ⏱ contrarreloj: tiempo restante
     boss:null,                                     // 👹 jefe final
     wrong:[],orbs:[],star:null,time:0,
     shake:0,flash:0,trail:[],parts:[],lastInf:null};
  resetActors();newQuestion();
  $("menuScreen").hidden=true;
  $("gameScreen").hidden=false;
  $("ov").style.display="none";
  toast(mode==="rush"?"⏱ ¡60 segundos! ¡YA!":"🕹️ ¡A jugar!","info",1400);
}

function resetActors(){
  S.pl=mk(9,7);S.want=null;S.inv=2;S.trail=[];
  S.ghosts=CFG[S.level].kinds.map((k,i)=>{
    const g=mk(...CORNERS[i]);g.kind=k;g.color=COLORS[i];g.err=CFG[S.level].err;return g;});
}

/* 👹 JEFE FINAL: gigante, lento pero implacable (err=0: nunca falla) */
function spawnBoss(){
  if(S.boss)return;
  S.boss=mk(9,3);S.boss.kind="boss";S.boss.err=0;
  beep(90,.6,"sawtooth");beep(70,.6,"sawtooth",.3);
  toast("👹 ¡JEFE FINAL! ¡Evítalo o congélalo con ⭐!","bad",2800);
  S.shake=.6;
}

function spawn(n){
  // Intenta con la separación ideal; si el mapa no tiene espacio suficiente
  // (mapas más grandes, más objetos a la vez...), la relaja paso a paso.
  // Así SIEMPRE se ubican las n casillas pedidas y nunca falta, por ejemplo,
  // la pastilla con la respuesta correcta.
  const all=shuffle(FREE.slice());
  for(let gap=5;gap>=1;gap--){
    const out=[];
    for(const c of all){
      if(out.length===n)break;
      if(!out.includes(c)&&md(c,S.pl)>=gap&&
         [...out,...S.orbs,S.star||{c:-9,r:-9}].every(o=>md(c,o)>=Math.max(gap-1,1)))out.push(c);
    }
    if(out.length===n)return out;
  }
  // Último recurso (mapa saturado): cualquier casilla libre que no repita.
  return all.slice(0,n);
}

function newQuestion(){
  S.q++;
  S.heat=Math.floor((S.q-1)/5);
  if(S.q>1&&S.q%5===1){
    toast("🔥 ¡Sube la presión! Los fantasmas aceleran","info");
    beep(700,.08);beep(950,.1,"square",.09);
    spawnBoss();                                    // 👹 con cada subida de presión llega el jefe
  }
  if(S.mode!=="rush")S.qt=CFG[S.level].qtime;
  S.lastTick=99;

  const base=S.pool||VERBS.filter(v=>TIERS[S.level].includes(v.tier));
  if(!S.deck.length)S.deck=S.pool?shuffle(base.slice()):weightedDeck(base);
  let v=S.deck.pop();
  if(v.inf===S.lastInf&&S.deck.length){S.deck.unshift(v);v=S.deck.pop();}
  S.lastInf=v.inf;

  const type=S.mode==="rush"||S.mode==="mix"?(Math.random()<.5?"past":"pp"):S.mode,
        ans=v[type];
  const r1=VERBS[rnd(VERBS.length)],r2=VERBS[rnd(VERBS.length)];
  const bad=[...new Set([
    v.inf+(v.inf.endsWith("e")?"d":"ed"),
    type==="past"?v.pp:v.past,
    v.inf,r1[type],r1.inf,r2[type],r2.inf
  ])].filter(x=>x&&x!==ans);
  while(bad.length<2){
    const x=VERBS[rnd(VERBS.length)][type];
    if(x!==ans&&!bad.includes(x))bad.push(x);
  }
  const texts=shuffle([ans,...shuffle(bad).slice(0,2)]);
  S.cur={v,type,ans};S.orbs=[];
  spawn(3).forEach((c,i)=>S.orbs.push({c:c.c,r:c.r,text:texts[i],ok:texts[i]===ans}));
  $("q").innerHTML=`<small>${type==="past"?"Past Simple":"Past Participle"} de</small> <b>${v.inf.toUpperCase()}</b> <i>(${v.es})</i> <button class="mini" onclick="sayQ()" title="Escuchar el verbo">🔊</button>`;
  hud();
}
function sayQ(){if(S&&S.cur)say(S.cur.v.inf);}

function hud(){
  $("sc").textContent=S.score;
  $("qn").textContent=S.mode==="rush"
    ?"⏱ "+Math.max(0,Math.ceil(S.rt))+" s"
    :`${Math.min(S.q,S.total)}/${S.total}`;
  $("st").textContent="🔥"+S.streak;
  $("lv").textContent=S.mode==="rush"?"⏱ RUSH":"❤️".repeat(Math.max(S.lives,0))||"💀";
}

function answer(o){
  S.answered++;
  const v=S.cur.v,trio=`${v.inf} – ${v.past} – ${v.pp}`,spoken=trio.replace(/ – /g,", ");
  noteResult(v,o.ok);
  if(o.ok){                                        // ✔ acierto
    S.streak++;S.maxStreak=Math.max(S.maxStreak,S.streak);S.correct++;
    let gain=Math.round(100*(1+Math.min(S.streak-1,5)*.5)*CFG[S.level].mult*(1+S.heat*.15));
    if(S.double>0)gain*=2;
    S.score+=gain;
    beep(660,.09);beep(880,.14,"square",.09);
    say(spoken);
    toast("✔ "+trio,"ok");
    burst(o.c,o.r,"#7cfc6a");floatText(o.c,o.r,"+"+gain,"#7cfc6a");
    if(S.mode==="rush"){                           // ⏱ acertar regala segundos
      S.rt=Math.min(S.rt+2,99);
      floatText(o.c,o.r-.5,"+2 s","#7ef2ff");
    }
    if(S.streak%3===0&&!S.star){
      const c=spawn(1)[0];
      if(c){const r=Math.random();
        const kind=r<.18&&(S.lives<3||S.mode==="rush")?"heart":r<.45?"gem":"freeze";
        S.star={c:c.c,r:c.r,kind};}
    }
  }else{                                           // ✖ error
    S.streak=0;
    beep(140,.4,"sawtooth");
    say(spoken);
    S.wrong.push({v,mine:o.text});
    burst(o.c,o.r,"#ff5555");S.shake=.3;S.flash=.7;
    if(S.mode==="rush"){S.rt=Math.max(0,S.rt-5);toast("✖ −5 s · Era: "+trio,"bad");}
    else{S.lives--;toast("✖ Era: "+trio,"bad");}
  }
  hud();
  if(S.mode==="rush"&&S.rt<=0)return endGame();
  if(S.lives<=0||S.q>=S.total)endGame();else newQuestion();
}

function timeUp(){                                 // ⏱ se agotó la barra de la pregunta
  const v=S.cur.v,trio=`${v.inf} – ${v.past} – ${v.pp}`,spoken=trio.replace(/ – /g,", ");
  noteResult(v,false);
  S.streak=0;S.lives--;
  S.wrong.push({v,mine:"⏱ sin respuesta"});
  beep(180,.35,"sawtooth");say(spoken);
  toast("⏱ ¡Tiempo agotado! Era: "+trio,"bad");
  S.shake=.3;S.flash=.7;
  hud();
  if(S.lives<=0||S.q>=S.total)endGame();else newQuestion();
}

function hitGhost(){
  S.shake=.5;S.flash=1;
  beep(110,.5,"sawtooth");
  burst(S.pl.x,S.pl.y,"#ffd60a");
  if(S.mode==="rush"){                             // ⏱ en contrarreloj el castigo es tiempo
    S.rt=Math.max(0,S.rt-5);S.inv=1.5;S.streak=0;
    toast("👻 −5 s","bad");hud();return;
  }
  S.lives--;S.streak=0;
  toast(S.lives>0?"👻 ¡Te pillaron!":"💀 Sin vidas…","bad");
  hud();
  if(S.lives<=0)endGame();else resetActors();
}

function hitBoss(){                                // 👹 el jefe golpea más fuerte
  S.shake=.8;S.flash=1;
  beep(60,.7,"sawtooth");
  burst(S.pl.x,S.pl.y,"#b14cff");
  if(S.mode==="rush"){S.rt=Math.max(0,S.rt-8);S.inv=1.5;S.streak=0;toast("👹 −8 s","bad");hud();return;}
  S.lives--;S.streak=0;
  toast("👹 ¡El jefe te aplastó!","bad");
  hud();
  if(S.lives<=0)endGame();else resetActors();
}

function pickupStar(){
  const k=S.star.kind;S.star=null;
  if(k==="heart"){
    if(S.mode==="rush"){S.rt=Math.min(S.rt+6,99);toast("❤️ +6 segundos","ok");}
    else{S.lives=Math.min(S.lives+1,5);toast("❤️ ¡Vida extra!","ok");}
    beep(880,.1);beep(1320,.18,"triangle",.1);burst(S.pl.x,S.pl.y,"#ff6b81");
  }
  else if(k==="gem"){S.double=10;toast("💎 ¡Puntos x2 durante 10 s!","info");
    jingle([[990,.08,0],[1320,.08,.08],[1760,.14,.16]]);burst(S.pl.x,S.pl.y,"#38e1ff");}
  else{S.freeze=5;toast("❄ ¡Fantasmas congelados! (y el jefe 👹)","info");
    beep(1200,.3,"triangle");burst(S.pl.x,S.pl.y,"#b8e6ff");}
  hud();
}

function burst(c,r,color,n=14){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,sp=1.5+Math.random()*3.5;
    S.parts.push({x:c+.5,y:r+.5,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.55+Math.random()*.35,t:0,color});
  }
}
function floatText(c,r,txt,color){S.parts.push({txt,x:c+.5,y:r+.2,vx:0,vy:-1.3,life:.9,t:0,color});}
function updateParts(dt){
  for(const p of S.parts){p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
  S.parts=S.parts.filter(p=>p.t<p.life);
}

function update(dt){
  S.time+=dt;S.inv-=dt;
  S.shake=Math.max(0,S.shake-dt*1.5);
  S.flash=Math.max(0,S.flash-dt*2);
  S.double=Math.max(0,S.double-dt);
  updateParts(dt);
  const wasFrozen=S.freeze>0;S.freeze-=dt;
  if(wasFrozen&&S.freeze<=0)toast("👻 ¡Los fantasmas se descongelan!","info",1600);

  /* ⏱ relojes: contrarreloj global o barra por pregunta */
  if(S.mode==="rush"){
    S.rt-=dt;
    const c=Math.ceil(S.rt);
    if(c!==S.rtShown){S.rtShown=c;hud();}
    if(S.rt<=5&&S.rt>0&&c!==S.lastTick){S.lastTick=c;beep(420,.05);}
    if(S.rt<=0)return endGame();
    if(!S.boss&&S.rt<=30)spawnBoss();              // 👹 el jefe llega a mitad del rush
  }else{
    S.qt-=dt;
    if(S.qt<=3&&S.qt>0&&Math.ceil(S.qt)!==S.lastTick){S.lastTick=Math.ceil(S.qt);beep(420,.05);}
    if(S.qt<=0)return timeUp();
  }

  const p=S.pl,w=S.want;
  if(w&&(p.tc!==p.c||p.tr!==p.r)&&w[0]===-p.dx&&w[1]===-p.dy){
    [p.c,p.tc]=[p.tc,p.c];[p.r,p.tr]=[p.tr,p.r];p.t=1-p.t;p.dx*=-1;p.dy*=-1;
  }
  step(p,PSPEED,dt,pickPlayer);
  if(p.dx||p.dy)S.ang=Math.atan2(p.dy,p.dx);
  S.trail.push({x:p.x,y:p.y});if(S.trail.length>10)S.trail.shift();

  const gspeed=CFG[S.level].speed*(1+S.heat*.1);
  if(S.freeze<=0)S.ghosts.forEach(g=>step(g,gspeed,dt,pickGhost));
  if(S.boss&&S.freeze<=0)step(S.boss,gspeed*.7,dt,pickGhost);   // 👹 más lento, nunca falla

  if(S.freeze<=0&&S.inv<=0){
    if(S.ghosts.some(g=>Math.hypot(g.x-p.x,g.y-p.y)<.7))return hitGhost();
    if(S.boss&&Math.hypot(S.boss.x-p.x,S.boss.y-p.y)<1.05)return hitBoss();
  }
  const hit=S.orbs.find(o=>Math.hypot(o.c-p.x,o.r-p.y)<.55);
  if(hit)return answer(hit);
  if(S.star&&Math.hypot(S.star.c-p.x,S.star.r-p.y)<.6)pickupStar();
}

function endGame(){
  S.run=false;
  try{speechSynthesis.cancel();}catch(e){}
  clearToasts();
  try{localStorage.setItem("pv-games",(+localStorage.getItem("pv-games")||0)+1);}catch(e){}
  const isRush=S.mode==="rush";
  const acc=S.answered?Math.round(S.correct/S.answered*100)/10:0;
  const nota=isRush?acc:Math.round(S.correct/S.total*100)/10;
  const g=isRush
    ?(S.score>=3000?"S":S.score>=2200?"A":S.score>=1500?"B":S.score>=800?"C":"D")
    :(nota>=9.5?"S":nota>=8.5?"A":nota>=7?"B":nota>=5?"C":"D");
  let best=0,nuevo=false;
  const key=isRush?"pv-best-rush":"pv-best";       // récord separado para contrarreloj
  try{best=+localStorage.getItem(key)||0;
      if(S.score>best){best=S.score;localStorage.setItem(key,best);nuevo=true;}}catch(e){}
  const rows=S.wrong.map(x=>`<tr><td>${x.v.inf}</td><td>${x.v.past}</td><td>${x.v.pp}</td><td>${x.mine}</td></tr>`).join("");
  const nErr=new Set(S.wrong.map(x=>x.v.inf)).size;
  $("box").innerHTML=`
    <div class="grade">${g}</div>
    <h2 style="margin:4px 0">${isRush?"⏱ ¡Se acabó el tiempo!":"Nota: "+nota.toFixed(1)+" / 10"}</h2>
    <p>${isRush?"":(S.lives<=0?"💀 Te quedaste sin vidas<br>":"🏁 Partida completa<br>")}
    ⭐ Puntos: <b>${S.score}</b> · Récord${isRush?" ⏱":""}: ${best}${nuevo?" 🆕":""}<br>
    ✔ ${S.correct} de ${isRush?S.answered:S.total} · 🔥 Mejor racha: ${S.maxStreak}</p>
    ${rows?`<h3>Para repasar</h3>
      <table><tr><th>Inf.</th><th>Past</th><th>P.P.</th><th>Tu resp.</th></tr>${rows}</table>
      <button class="go" onclick="startReview()">🔁 Repasar mis fallos (${nErr})</button>
      <button class="alt" onclick="exportWrong()">⬇ Fallos a CSV</button>
      <p class="mini-note">🧠 Esos verbos aparecerán más a menudo en futuras partidas.</p>`
      :"<h3>🎉 ¡Sin errores!</h3>"}
    <button class="go" onclick="start()">▶ Jugar otra vez</button>
    <button onclick="menu()">🏠 Menú principal</button>
    <button class="alt" onclick="study()">📖 Estudiar</button>`;
  $("ov").style.display="flex";
  if(isRush?S.score>=800:nota>=5)jingle([[523,.12,0],[659,.12,.13],[784,.22,.26],[1047,.3,.42]]);
  else jingle([[330,.2,0],[262,.3,.22]]);
}

function startReview(){
  if(!S||!S.wrong.length)return;
  const pool=[...new Map(S.wrong.map(x=>[x.v.inf,x.v])).values()];
  start(pool,S.level,S.mode);
}

/* ============ 9. EXPORTAR CSV (para el profe 📤) ============ */
function downloadCSV(name,content){
  const blob=new Blob(["\uFEFF"+content],{type:"text/csv;charset=utf-8"}); // BOM: acentos OK en Excel
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast("⬇ CSV descargado","ok");
}
function exportWrong(){                            // los fallos de ESTA partida
  if(!S||!S.wrong.length)return;
  const head="infinitivo;pasado;participio;español;tu_respuesta;modo;nivel;fecha";
  const rows=S.wrong.map(x=>[x.v.inf,x.v.past,x.v.pp,x.v.es,x.mine,
    S.mode,S.level,new Date().toLocaleDateString("es-ES")].join(";"));
  downloadCSV("fallos_verbos.csv",[head,...rows].join("\n"));
}
function exportAll(){                              // el diccionario completo
  const head="infinitivo;pasado;participio;español;nivel";
  const rows=VERBS.map(v=>[v.inf,v.past,v.pp,v.es,v.tier].join(";"));
  downloadCSV("verbos_irregulares.csv",[head,...rows].join("\n"));
}

/* ============ 10. MODO ESTUDIO ============ */
function study(){renderStudy("all");}
function renderStudy(tier){
  clearToasts();
  const list=VERBS.filter(v=>tier==="all"||v.tier===tier);
  STUDY=list;
  $("box").innerHTML=`
    <h2>📖 Diccionario · ${list.length} verbos</h2>
    <p style="margin:6px 0">
      <select id="stTier" onchange="renderStudy(this.value)">
        <option value="all"${tier==="all"?" selected":""}>Todos</option>
        <option value="A"${tier==="A"?" selected":""}>Nivel A · fáciles</option>
        <option value="B"${tier==="B"?" selected":""}>Nivel B · medios</option>
        <option value="C"${tier==="C"?" selected":""}>Nivel C · difíciles</option>
      </select>
      <input id="stQ" type="search" placeholder="🔍 Buscar…" oninput="filterStudy()">
    </p>
    <table id="studyTable">
      <tr><th>Inf.</th><th>Past</th><th>P.P.</th><th>🇪🇸</th><th></th></tr>
      ${list.map((v,i)=>`<tr data-i="1"><td><b>${v.inf}</b></td><td>${v.past}</td><td>${v.pp}</td><td>${v.es}</td>
        <td><button class="mini" onclick="sayVerb(${i})">🔊</button></td></tr>`).join("")}
    </table>
    <button onclick="menu()">↩ Volver</button>
    <button class="alt" onclick="exportAll()">⬇ Verbos a CSV</button>
    <button class="alt" onclick="wipeMemory()">🧹 Borrar memoria</button>`;
  $("ov").style.display="flex";
}
function filterStudy(){
  const q=($("stQ").value||"").toLowerCase();
  document.querySelectorAll("#studyTable tr[data-i]").forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q)?"":"none";
  });
}
function sayVerb(i){const v=STUDY[i];if(v){unlockAudio();say(`${v.inf}, ${v.past}, ${v.pp}`);}}
async function wipeMemory(){
  const ok=await ask({
    ico:"🧹",
    title:"¿Borrar la memoria del juego?",
    text:"Se olvidarán tus fallos aprendidos, el récord y las partidas jugadas. Esto no se puede deshacer.",
    yes:"Sí, borrar todo",no:"Cancelar",danger:true});
  if(!ok)return;
  STATS={};saveStats();
  try{localStorage.removeItem("pv-best");localStorage.removeItem("pv-best-rush");
      localStorage.removeItem("pv-games");}catch(e){}
  const t=$("stTier");renderStudy(t?t.value:"all");
  toast("🧹 Memoria borrada. Empezamos de cero.","info");
}

/* ============ 11. PAUSA ============ */
function togglePause(){
  if(!S||!S.run)return;
  PAUSED=!PAUSED;
  if(PAUSED){
    try{speechSynthesis.cancel();}catch(e){}
    clearToasts();
    $("box").innerHTML=`<h2>⏸ Pausa</h2>
      <p style="opacity:.8">Respira… los fantasmas, el jefe y el reloj esperan.</p>
      <button class="go" onclick="togglePause()">▶ Continuar</button>
      <button onclick="quitToMenu()">🏠 Salir al menú</button>`;
    $("ov").style.display="flex";
  }else{
    $("ov").style.display="none";
  }
}
async function quitToMenu(){
  const ok=await ask({
    ico:"🚪",
    title:"¿Salir al menú?",
    text:"Perderás el progreso de esta partida.",
    yes:"Salir",no:"Seguir jugando",danger:true});
  if(!ok)return;
  menu();
}

/* ============ 12. DIBUJO ============ */
function draw(){
  ctx.clearRect(0,0,COLS*T,ROWS*T);
  ctx.save();
  if(S&&S.shake>0){const m=S.shake*10;ctx.translate((Math.random()-.5)*m,(Math.random()-.5)*m);}
  ctx.drawImage(walls,0,0,COLS*T,ROWS*T);
  if(!S){ctx.restore();return;}

  ctx.textAlign="center";ctx.textBaseline="middle";

  S.trail.forEach((t,i)=>{
    ctx.globalAlpha=(i+1)/S.trail.length*.22;
    ctx.fillStyle="#ffd60a";
    ctx.beginPath();ctx.arc(t.x*T+T/2,t.y*T+T/2,2+5*(i+1)/S.trail.length,0,7);ctx.fill();
  });
  ctx.globalAlpha=1;

  if(S.star){
    ctx.font="24px sans-serif";
    ctx.fillText(ICON[S.star.kind],S.star.c*T+T/2,S.star.r*T+T/2+Math.sin(S.time*6)*3);
  }

  ctx.font="bold 14px Verdana,sans-serif";
  S.orbs.forEach(o=>{
    const w=ctx.measureText(o.text).width+16,x=o.c*T+T/2,y=o.r*T+T/2;
    ctx.fillStyle="#111";ctx.strokeStyle="#ffd60a";ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(x-w/2,y-11,w,22,11);ctx.fill();ctx.stroke();
    ctx.fillStyle="#fff";ctx.fillText(o.text,x,y+1);
  });

  S.ghosts.forEach(g=>{
    const x=g.x*T+T/2,y=g.y*T+T/2,fz=S.freeze>0;
    ctx.fillStyle=fz?"#b8e6ff":g.color;
    ctx.beginPath();ctx.arc(x,y-2,13,Math.PI,0);ctx.lineTo(x+13,y+13);
    for(let i=0;i<4;i++)ctx.lineTo(x+13-i*6.5-3.25,y+(i%2?13:8));
    ctx.lineTo(x-13,y+13);ctx.fill();
    ctx.fillStyle="#fff";[-5,5].forEach(e=>{ctx.beginPath();ctx.arc(x+e,y-4,4,0,7);ctx.fill();});
    ctx.fillStyle="#12f";[-5,5].forEach(e=>{ctx.beginPath();ctx.arc(x+e+g.dx*2,y-4+g.dy*2,2,0,7);ctx.fill();});
    if(fz){ctx.font="10px sans-serif";ctx.fillText("❄",x,y-16);}
  });

  /* 👹 JEFE FINAL: el doble de grande, con corona y ojos rojos */
  if(S.boss){
    const x=S.boss.x*T+T/2,y=S.boss.y*T+T/2,fz=S.freeze>0,r=21;
    ctx.fillStyle=fz?"#b8e6ff":"#b14cff";
    ctx.beginPath();ctx.arc(x,y-3,r,Math.PI,0);ctx.lineTo(x+r,y+r);
    for(let i=0;i<4;i++)ctx.lineTo(x+r-i*(r/2)-r/4,y+(i%2?r:r-7));
    ctx.lineTo(x-r,y+r);ctx.fill();
    ctx.font="16px sans-serif";ctx.fillText("👑",x,y-r-6);
    ctx.fillStyle="#fff";[-7,7].forEach(e=>{ctx.beginPath();ctx.arc(x+e,y-6,6,0,7);ctx.fill();});
    ctx.fillStyle="#c00";[-7,7].forEach(e=>{ctx.beginPath();ctx.arc(x+e+S.boss.dx*2.5,y-6+S.boss.dy*2.5,3,0,7);ctx.fill();});
    if(fz){ctx.font="12px sans-serif";ctx.fillText("❄",x,y-r-24);}
  }

  const p=S.pl,px=p.x*T+T/2,py=p.y*T+T/2,m=.05+.22*Math.abs(Math.sin(S.time*14));
  if(S.inv<=0||Math.floor(S.time*10)%2){
    ctx.fillStyle="#ffd60a";
    ctx.beginPath();ctx.moveTo(px,py);
    ctx.arc(px,py,14,S.ang+m*Math.PI,S.ang+(2-m)*Math.PI);ctx.fill();
  }

  for(const q of S.parts){
    const a=1-q.t/q.life;
    ctx.globalAlpha=a;
    if(q.txt){ctx.font="bold 15px Verdana,sans-serif";ctx.fillStyle=q.color;ctx.fillText(q.txt,q.x*T,q.y*T);}
    else{ctx.fillStyle=q.color;ctx.fillRect(q.x*T-2,q.y*T-2,4,4);}
    ctx.globalAlpha=1;
  }

  if(S.flash>0){
    ctx.fillStyle="rgba(255,40,40,"+(S.flash*.25)+")";
    ctx.fillRect(-20,-20,COLS*T+40,ROWS*T+40);
  }

  /* barra de tiempo: contrarreloj global o reloj de pregunta */
  const isRush=S.mode==="rush";
  const frac=isRush?clamp(S.rt/60,0,1):clamp(S.qt/CFG[S.level].qtime,0,1);
  const danger=isRush?S.rt<8:S.qt<4;
  ctx.fillStyle="rgba(255,255,255,.15)";ctx.fillRect(4,3,COLS*T-8,5);
  ctx.fillStyle=danger?"#ff4040":"#ffd60a";ctx.fillRect(4,3,(COLS*T-8)*frac,5);
  if(S.double>0){ctx.font="bold 12px Verdana,sans-serif";ctx.fillStyle="#38e1ff";
    ctx.fillText("💎x2 "+Math.ceil(S.double)+"s",COLS*T-34,16);}

  if(S.lives===1&&!isRush){
    ctx.strokeStyle="rgba(255,59,59,"+(.35+.25*Math.sin(S.time*6))+")";
    ctx.lineWidth=6;ctx.strokeRect(3,3,COLS*T-6,ROWS*T-6);
  }
  ctx.restore();
}

let last=0;
function loop(ts){
  const dt=Math.min((ts-last)/1000,.05);last=ts;
  if(S&&S.run&&!PAUSED)update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ============ 13. CONTROLES ============ */
const KEYS={ArrowLeft:0,a:0,ArrowRight:1,d:1,ArrowUp:2,w:2,ArrowDown:3,s:3};
addEventListener("keydown",e=>{
  if($("modal").style.display==="flex")return;
  if(e.key==="p"||e.key==="P"||e.key==="Escape"){togglePause();return;}
  const k=KEYS[e.key]??KEYS[e.key.toLowerCase()];
  if(k===undefined||!S||PAUSED)return;
  e.preventDefault();
  S.want=DIRS[k];
});

document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    if(S&&S.run&&!PAUSED)togglePause();
    if(musicOn)stopMusic();
  }else if(onMenu()&&hadGesture&&!musicUserOff)startMusic();
});

let tx=0,ty=0;
cv.addEventListener("touchstart",e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
cv.addEventListener("touchend",e=>{
  if(!S||PAUSED)return;
  const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;
  if(Math.max(Math.abs(dx),Math.abs(dy))<20)return;
  S.want=Math.abs(dx)>Math.abs(dy)?DIRS[dx<0?0:1]:DIRS[dy<0?2:3];
});

(function initLabels(){
  const a=$("snd"),b=$("sndMenu");
  if(a)a.textContent=sound?"🔊":"🔇";
  if(b)b.textContent=sound?"🔊 Sonido activado":"🔇 Sonido apagado";
  updateMusicBtn();
})();
menu();