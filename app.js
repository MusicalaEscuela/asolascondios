/*
 * Musicala · A solas con Dios (intro, 2 compases en 4/4).
 * La práctica se organiza por frases musicales, no por notas sueltas:
 * escuchar en bucle con metrónomo y tocar en «modo espera».
 * Las ligaduras (La4, Sol4, Mi4) se tocan una sola vez y se sostienen.
 */
'use strict';

const NOTES = Object.freeze([
  {name:'Re', octave:4, midi:62, start:0,    beats:2,    finger:1},
  {name:'Mi', octave:4, midi:64, start:0.75, beats:0.25, finger:2},
  {name:'Fa', octave:4, midi:65, start:1,    beats:0.25, finger:3},
  {name:'Sol',octave:4, midi:67, start:1.25, beats:0.25, finger:4},
  {name:'Do', octave:5, midi:72, start:1.5,  beats:0.25, finger:5},
  {name:'La', octave:4, midi:69, start:1.75, beats:0.75, finger:4, tie:true},
  {name:'Fa', octave:4, midi:65, start:2.5,  beats:0.25, finger:2},
  {name:'Sol',octave:4, midi:67, start:2.75, beats:0.75, finger:3, tie:true},
  {name:'Re', octave:4, midi:62, start:3.5,  beats:0.25, finger:1},
  {name:'Mi', octave:4, midi:64, start:3.75, beats:2.25, finger:2, tie:true}
]);
const PHRASES = Object.freeze([
  {id:'A', title:'Frase A · La subida', sub:'Re sostenido + escalera Mi-Fa-Sol-Do', from:0, to:4, color:'#1f8fdc',
   tip:'Toca Re4 con el pulgar y no lo sueltes. Sobre él, sube Mi-Fa-Sol-Do en semicorcheas parejas: «y-a | 1-e-y». Piensa en una escalera que termina en un pequeño salto.'},
  {id:'B', title:'Frase B · El suspiro', sub:'La ligada · Fa · Sol ligada', from:5, to:7, color:'#a21fd0',
   tip:'Después del Do agudo, cae a La y sostenlo (es una ligadura: un solo ataque). Luego Fa corto y Sol largo. Que suene como un suspiro: más suave al bajar.'},
  {id:'C', title:'Frase C · La llegada', sub:'Re · Mi que cruza el compás', from:8, to:9, color:'#d81b5a',
   tip:'Re4 corto y Mi4 largo, que atraviesa la barra de compás. Sostén Mi y deja los dos pulsos de silencio antes de volver a empezar.'},
  {id:'ALL', title:'Intro completa', sub:'Las tres frases unidas', from:0, to:9, color:'#5b3bff',
   tip:'Une las frases sin cortar el sonido entre ellas. Empieza lento (45–50 BPM) y súbele 5 BPM cada vez que logres una ronda limpia.'}
]);
const TOTAL_BEATS = 8, ROUNDS_GOAL = 3;
const SPANISH = ['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
const WHITE_MIDIS = [60,62,64,65,67,69,71,72,74,76,77];
const BLACK_MIDIS = [61,63,66,68,70,73,75];
const KEY_MAPPING = {KeyA:60,KeyS:62,KeyD:64,KeyF:65,KeyG:67,KeyH:69,KeyJ:71,KeyK:72,KeyL:74};
const ROWS = [72,69,67,65,64,62];
const STORAGE_KEY = 'musicala-a-solas-con-dios';

const $ = id => document.getElementById(id);
const fullName = midi => `${SPANISH[midi%12]}${Math.floor(midi/12)-1}`;
const label = n => `${n.name}${n.octave}`;

let phraseIndex = 0, tempo = 55;
let audioCtx = null, master = null;
let playing = false, rafId = null, playStart = 0, playOffset = 0, playLength = 0, loopTimer = null;
let waiting = false, waitPos = 0, roundErrors = 0, totalErrors = 0, cleanRounds = 0;
let progress = loadProgress();
const keys = new Map(), noteEls = [], zoneEls = [];

function loadProgress(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveProgress(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch {}
}
const phrase = () => PHRASES[phraseIndex];
const phraseNotes = () => NOTES.slice(phrase().from, phrase().to + 1);

/* ---------- Audio ---------- */
function initAudio(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx){ setMessage('⚠️','Tu navegador no admite sonido, pero puedes usar el piano visual.','bad'); return null; }
    audioCtx = new Ctx(); master = audioCtx.createGain(); master.gain.value = .9; master.connect(audioCtx.destination);
  }
  if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function tone(midi, when, duration=.45){
  const ctx = initAudio(); if(!ctx) return;
  const t = Math.max(ctx.currentTime + .005, when), len = Math.max(.09, duration), f = 440*Math.pow(2,(midi-69)/12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.16,t+.01);
  g.gain.exponentialRampToValueAtTime(.07,t+Math.min(.25,len*.5)); g.gain.exponentialRampToValueAtTime(.0001,t+len+.35);
  g.connect(master);
  for(const [type,mul,vol] of [['triangle',1,1],['sine',2,.18],['sine',3,.06]]){
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = type; o.frequency.value = f*mul; og.gain.value = vol;
    o.connect(og); og.connect(g); o.start(t); o.stop(t+len+.4);
  }
}
function click(when, accent){
  const ctx = audioCtx; if(!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1600 : 1100;
  g.gain.setValueAtTime(.0001,when); g.gain.exponentialRampToValueAtTime(accent?.09:.05,when+.002); g.gain.exponentialRampToValueAtTime(.0001,when+.05);
  o.connect(g); g.connect(master); o.start(when); o.stop(when+.06);
}

/* ---------- Construcción de la interfaz ---------- */
function buildPiano(){
  const piano = $('piano');
  WHITE_MIDIS.forEach(midi=>{
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'white-key' + (midi===60 ? ' central-key' : '');
    el.setAttribute('aria-label', `Tocar ${fullName(midi)}`);
    el.innerHTML = `<span class="finger"></span><span class="key-name">${fullName(midi)}</span>`;
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); press(midi); });
    piano.append(el); keys.set(midi, el);
  });
  BLACK_MIDIS.forEach(midi=>{
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'black-key';
    const whitesLeft = WHITE_MIDIS.filter(n=>n<midi).length;
    el.style.left = `calc(${whitesLeft} * (var(--white-width) - 1px) + 3px - var(--black-width) / 2)`;
    el.setAttribute('aria-label', `Tocar ${fullName(midi)}`);
    el.innerHTML = `<span class="key-name">${SPANISH[midi%12].replace('♯','#')}</span>`;
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); press(midi); });
    piano.append(el); keys.set(midi, el);
  });
}
function buildPhrases(){
  const list = $('phraseList');
  PHRASES.forEach((p,i)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'phrase'; b.setAttribute('role','tab');
    const notes = NOTES.slice(p.from, p.to+1).map(label).join(' · ');
    b.innerHTML = `<span class="ph-letter" style="background:${p.color}">${p.id==='ALL'?'★':p.id}</span>
      <strong>${p.title}</strong><small>${p.sub}</small><span class="ph-notes">${notes}</span><span class="ph-badge"></span>`;
    b.addEventListener('click', ()=>selectPhrase(i));
    list.append(b);
  });
}
const xPct = beat => beat / TOTAL_BEATS * 100;
const xPos = (beat, px=0) => `calc(44px + (100% - 44px) * ${beat/TOTAL_BEATS} + ${px}px)`;
const wPos = (beats, px=0) => `calc((100% - 44px) * ${beats/TOTAL_BEATS} + ${px}px)`;
const yPx = midi => 24 + ROWS.indexOf(midi) * 32;
function buildTimeline(){
  const tl = $('timeline');
  PHRASES.slice(0,3).forEach(p=>{
    const s = NOTES[p.from].start, e = p.to===9 ? TOTAL_BEATS : NOTES[p.to+1].start;
    const z = document.createElement('div');
    z.className = 'tl-zone'; z.style.left = xPos(s); z.style.width = wPos(e-s); z.style.background = p.color;
    tl.append(z); zoneEls.push(z);
  });
  ROWS.forEach(midi=>{
    const r = document.createElement('div'); r.className = 'tl-row'; r.style.top = yPx(midi)+'px'; tl.append(r);
    const l = document.createElement('span'); l.className = 'tl-label'; l.style.top = yPx(midi)+'px'; l.textContent = fullName(midi); tl.append(l);
  });
  for(let b=0;b<=TOTAL_BEATS;b+=4){ const bar = document.createElement('div'); bar.className='tl-bar'; bar.style.left = xPos(b, b?-2:0); tl.append(bar); }
  NOTES.forEach((n,i)=>{
    const owner = PHRASES.slice(0,3).find(p=>i>=p.from && i<=p.to);
    const el = document.createElement('div');
    el.className = 'tl-note' + (n.tie ? ' tie' : '');
    el.style.left = xPos(n.start,1); el.style.width = wPos(n.beats,-2);
    el.style.top = yPx(n.midi)+'px'; el.style.background = owner.color;
    el.textContent = n.name;
    tl.append(el); noteEls.push(el);
  });
  const ruler = $('beatRuler');
  for(let b=0;b<TOTAL_BEATS;b++){
    const s = document.createElement('span');
    s.style.left = xPos(b+.5); s.className = b%4===0 ? 'bar' : '';
    s.textContent = b%4===0 ? `C${b/4+1} · 1` : String(b%4+1);
    ruler.append(s);
  }
}

/* ---------- Render ---------- */
function setMessage(icon, text, status=''){
  const m = $('message'); m.className = 'message ' + status;
  m.querySelector('.msg-icon').textContent = icon; m.querySelector('p').textContent = text;
}
function render(){
  const p = phrase(), notes = phraseNotes();
  [...$('phraseList').children].forEach((b,i)=>{
    b.classList.toggle('active', i===phraseIndex); b.setAttribute('aria-selected', String(i===phraseIndex));
    b.querySelector('.ph-badge').textContent = progress[PHRASES[i].id] ? `✓ ${progress[PHRASES[i].id]} BPM` : '';
  });
  const mastered = PHRASES.filter(x=>progress[x.id]).length;
  $('masteryCount').textContent = `${mastered} / ${PHRASES.length} dominadas`;
  $('phraseTip').textContent = p.tip;
  zoneEls.forEach((z,i)=>z.classList.toggle('active', p.id==='ALL' || PHRASES[i].id===p.id));
  noteEls.forEach((el,i)=>{
    const inside = i>=p.from && i<=p.to;
    el.classList.toggle('in', inside);
    el.classList.toggle('now', waiting && inside && i===p.from+waitPos);
    el.classList.toggle('done', waiting && inside && i<p.from+waitPos);
  });
  const seq = $('sequence'); seq.textContent = '';
  notes.forEach((n,i)=>{
    const d = document.createElement('div');
    d.className = 'seq-note' + (waiting && i===waitPos ? ' now' : '') + (waiting && i<waitPos ? ' done' : '');
    d.innerHTML = `<b>${label(n)}</b><small>dedo ${n.finger}${n.tie?' · ligada':''}</small>`;
    seq.append(d);
  });
  renderKeys();
  $('rounds').hidden = !waiting;
  $('stars').textContent = '★'.repeat(Math.min(cleanRounds,ROUNDS_GOAL)) + '☆'.repeat(Math.max(0,ROUNDS_GOAL-cleanRounds));
  $('errorCount').textContent = totalErrors ? `· ${totalErrors} tecla${totalErrors>1?'s':''} equivocada${totalErrors>1?'s':''} en esta sesión` : '';
  $('waitButton').classList.toggle('on', waiting);
  $('waitButton').textContent = waiting ? '■ Salir del modo espera' : '🎹 Tocar (modo espera)';
}
function renderKeys(){
  const notes = phraseNotes();
  const targetFingers = new Map(notes.map(n=>[n.midi, n.finger]));
  const next = waiting ? notes[waitPos]?.midi : null;
  for(const [midi,el] of keys){
    el.classList.toggle('target', targetFingers.has(midi));
    el.classList.toggle('next', midi===next);
    const f = el.querySelector('.finger');
    if(f) f.textContent = midi===next ? notes[waitPos].finger : (targetFingers.get(midi) ?? '');
  }
}
function flashKey(midi, cls, ms=320){
  const el = keys.get(midi); if(!el) return;
  el.classList.add(cls); setTimeout(()=>el.classList.remove(cls), ms);
}

/* ---------- Reproducción ---------- */
function stopPlayback(){
  playing = false; cancelAnimationFrame(rafId); clearTimeout(loopTimer);
  if(audioCtx && master){ const t = audioCtx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(.0001,t,.02); }
  $('playhead').style.opacity = 0;
  $('playLabel').textContent = phrase().id==='ALL' ? 'Escuchar intro' : 'Escuchar frase'; $('playSymbol').textContent = '▶';
  for(const el of keys.values()) el.classList.remove('playing');
}
function startPlayback(withCount = $('countToggle').checked){
  const ctx = initAudio(); if(!ctx) return;
  if(waiting) exitWait(false);
  stopPlayback();
  const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(.9, now);
  const spb = 60/tempo, p = phrase(), notes = phraseNotes();
  playOffset = notes[0].start;
  const end = p.id==='ALL' || p.id==='C' ? TOTAL_BEATS : Math.max(...notes.map(n=>n.start+n.beats));
  playLength = end - playOffset;
  const countBeats = withCount ? 4 : 0;
  // Alinear la cuenta al pulso: la frase empieza en un punto fraccionario del compás.
  const lead = countBeats + (playOffset % 1);
  playStart = now + .12 + lead*spb;
  const metroFrom = Math.floor(playOffset) - countBeats, metroTo = Math.ceil(end);
  if($('metroToggle').checked || withCount){
    for(let b = metroFrom; b < metroTo; b++){
      if(b >= Math.floor(playOffset) && !$('metroToggle').checked) break;
      click(playStart + (b - playOffset)*spb, ((b%4)+4)%4===0);
    }
  }
  notes.forEach(n=>tone(n.midi, playStart + (n.start-playOffset)*spb, n.beats*spb));
  playing = true;
  $('playLabel').textContent = 'Detener'; $('playSymbol').textContent = '■';
  setMessage(withCount ? '🥁' : '🎧', withCount ? 'Cuenta 1-2-3-4 con el metrónomo y escucha la frase.' : 'Escucha y sigue la línea rosada.');
  rafId = requestAnimationFrame(animate);
}
function animate(){
  if(!playing) return;
  const beat = playOffset + (audioCtx.currentTime - playStart)*tempo/60;
  const ph = $('playhead');
  ph.style.opacity = beat >= playOffset ? 1 : .35;
  ph.style.left = xPos(Math.max(playOffset,beat));
  const sounding = new Set(phraseNotes().filter(n=>beat>=n.start && beat<n.start+n.beats).map(n=>n.midi));
  for(const [midi,el] of keys) el.classList.toggle('playing', sounding.has(midi));
  if(beat >= playOffset + playLength){
    if($('loopToggle').checked){ startPlayback(false); return; }
    stopPlayback();
    setMessage('🎼', '¿La tienes en el oído? Ahora tócala tú con «Modo espera».', 'good');
    return;
  }
  rafId = requestAnimationFrame(animate);
}

/* ---------- Modo espera ---------- */
function enterWait(){
  stopPlayback(); initAudio();
  waiting = true; waitPos = 0; roundErrors = 0; cleanRounds = 0;
  setMessage('🎯', `Toca ${label(phraseNotes()[0])} (dedo ${phraseNotes()[0].finger}). La tecla naranja es la siguiente.`);
  render(); scrollToKey(phraseNotes()[0].midi);
}
function exitWait(rerender = true){
  waiting = false; if(rerender){ render(); setMessage('✨','Modo espera desactivado. Puedes escuchar la frase otra vez.'); }
}
function press(midi){
  initAudio(); tone(midi, audioCtx ? audioCtx.currentTime+.01 : 0, .5); flashKey(midi,'playing',260);
  if(!waiting){ return; }
  if(playing) stopPlayback();
  const notes = phraseNotes(), expected = notes[waitPos];
  if(midi !== expected.midi){
    roundErrors++; totalErrors++; flashKey(midi,'wrong',400);
    setMessage('🔎', `Esa fue ${fullName(midi)}. Busca ${label(expected)} — la tecla naranja.`, 'bad');
    render(); return;
  }
  waitPos++;
  if(waitPos < notes.length){
    const n = notes[waitPos];
    setMessage('✅', `¡Bien! Ahora ${label(n)} con el dedo ${n.finger}${n.tie ? ' y sostenla (ligadura)' : ''}.`, 'good');
    render(); scrollToKey(n.midi); return;
  }
  // Ronda completa
  if(roundErrors === 0) cleanRounds++;
  const p = phrase();
  if(cleanRounds >= ROUNDS_GOAL){
    progress[p.id] = Math.max(progress[p.id]||0, tempo); saveProgress();
    setMessage('🏆', `¡${p.title} dominada! ${ROUNDS_GOAL} rondas limpias. Prueba con el metrónomo a ${tempo} BPM o pasa a la siguiente frase.`, 'good');
    waitPos = 0; roundErrors = 0; cleanRounds = 0; waiting = false; render(); return;
  }
  setMessage(roundErrors ? '💪' : '⭐', roundErrors
    ? `Ronda terminada con ${roundErrors} error${roundErrors>1?'es':''}. Otra vez: busca una ronda limpia.`
    : `¡Ronda limpia! Llevas ${cleanRounds} de ${ROUNDS_GOAL}. Otra vez desde el inicio.`, roundErrors ? '' : 'good');
  waitPos = 0; roundErrors = 0; render();
}
function scrollToKey(midi){
  const el = keys.get(midi), sc = $('pianoScroller'); if(!el) return;
  const left = Math.max(0, el.offsetLeft + el.offsetWidth/2 - sc.clientWidth/2);
  if(Math.abs(sc.scrollLeft-left) > 40) sc.scrollTo({left, behavior:'smooth'});
}

function selectPhrase(i){
  stopPlayback(); waiting = false; phraseIndex = i; waitPos = 0; cleanRounds = 0; roundErrors = 0;
  render(); stopPlayback();
  setMessage('🎵', `${PHRASES[i].title}: primero escúchala, luego tócala en modo espera.`);
  scrollToKey(phraseNotes()[0].midi);
}

function setup(){
  buildPiano(); buildPhrases(); buildTimeline(); render();
  $('playButton').addEventListener('click', ()=> playing ? (stopPlayback(), setMessage('⏸','Pausa.')) : startPlayback());
  $('waitButton').addEventListener('click', ()=> waiting ? exitWait() : enterWait());
  $('tempoSlider').addEventListener('input', e=>{ tempo = Number(e.target.value); $('tempoValue').textContent = `${tempo} BPM`; if(playing) startPlayback(false); });
  $('showLabels').addEventListener('change', e=>$('piano').classList.toggle('hide-labels', !e.target.checked));
  $('showFingers').addEventListener('change', e=>$('piano').classList.toggle('hide-fingers', !e.target.checked));
  document.addEventListener('keydown', e=>{
    if(e.ctrlKey||e.altKey||e.metaKey||e.repeat||e.target.closest('input,textarea,select')) return;
    if(e.code==='Space'){ e.preventDefault(); $('playButton').click(); return; }
    const midi = KEY_MAPPING[e.code]; if(midi===undefined) return;
    e.preventDefault(); press(midi);
  });
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden && playing) stopPlayback(); });
  scrollToKey(62);
}
setup();
