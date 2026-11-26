/* ===== Learn with Yella — app.js =====
   Vanilla JS single-page app. Sections:
   1 Config & data  2 Art slots  3 Voice  4 Music/SFX  5 Effects  6 Logging  7 Screens  8 Boot */
'use strict';

/* ---------- 1. CONFIG & DATA ---------- */
const CONFIG = {
  APPS_SCRIPT_URL: '',          // <-- paste your Google Apps Script Web App URL (ends in /exec)
  USE_RECORDED_AUDIO: false,    // true = try audio/<en|fil>/<key>.mp3 first, fall back to Web Speech
  MUSIC_VOLUME: 0.05
};

const AVATARS = [
  { id: 'tigre-timmy',  name: 'Tigre Timmy',  emoji: '🐯' },
  { id: 'agila-mia',    name: 'Agila Mia',    emoji: '🦅' },
  { id: 'pagong-leo',   name: 'Pagong Leo',   emoji: '🐢' },
  { id: 'unggoy-sam',   name: 'Unggoy Sam',   emoji: '🐵' },
  { id: 'elepante-ellie', name: 'Elepante Ellie', emoji: '🐘' },
  { id: 'palaka-pia',   name: 'Palaka Pia',   emoji: '🐸' }
];
const LETTERS = [
  { l: 'A', sound: 'ah',   en: 'Apple', fil: 'Mansanas', emoji: '🍎', key: 'apple' },
  { l: 'B', sound: 'buh',  en: 'Ball',  fil: 'Bola',     emoji: '⚽', key: 'ball' },
  { l: 'C', sound: 'kuh',  en: 'Cat',   fil: 'Pusa',     emoji: '🐱', key: 'cat' },
  { l: 'D', sound: 'duh',  en: 'Dog',   fil: 'Aso',      emoji: '🐶', key: 'dog' },
  { l: 'E', sound: 'eh',   en: 'Egg',   fil: 'Itlog',    emoji: '🥚', key: 'egg' },
  { l: 'F', sound: 'fff',  en: 'Fish',  fil: 'Isda',     emoji: '🐟', key: 'fish' }
];
const NUM_WORDS = {
  en:  ['One', 'Two', 'Three', 'Four', 'Five'],
  fil: ['Isa', 'Dalawa', 'Tatlo', 'Apat', 'Lima']
};
const FRUITS = ['🍌', '🥭', '🍍', '🍉', '🥥'];
// Spoken prompts (children can't read, so every screen has a voice cue)
const PROMPTS = {
  welcome: { en: 'Hi! I am Yella! Pick your friend!', fil: 'Hi! Ako si Yella! Pumili ng kaibigan!' },
  map:     { en: 'Where shall we go?',                 fil: 'Saan tayo pupunta?' },
  sounds:  { en: 'Tap a picture!',                     fil: 'Pindutin ang larawan!' },
  numbers: { en: "Let's count! Tap the fruit!",        fil: 'Magbilang tayo! Pindutin ang prutas!' },
  praise:  { en: 'Yay! Great job!',                    fil: 'Yehey! Galing!' }
};

const state = {
  avatar: null, lang: 'bilingual', stars: 0, musicOn: true,
  sessionId: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  tapped: new Set()
};
const $ = (s) => document.querySelector(s);
const langs = () => (state.lang === 'bilingual' ? ['en', 'fil'] : [state.lang]);

/* ---------- 2. ART SLOTS ----------
   Shows an emoji instantly; if images/<key>.png exists it replaces the emoji.
   Drop your own PNGs into /images using the key names in README.md. */
function art(key, emoji) {
  const w = document.createElement('span');
  w.className = 'art';
  w.textContent = emoji;
  const img = new Image();
  img.alt = '';
  img.onload = () => { w.textContent = ''; w.appendChild(img); };
  img.src = `images/${key}.png`;     // 404 -> onload never fires -> emoji stays
  return w;
}
function btn(cls, key, emoji, onTap, extra) {
  const b = document.createElement('button');
  b.className = cls;
  b.appendChild(art(key, emoji));
  if (extra) b.appendChild(extra);
  b.addEventListener('click', (e) => onTap(b, e));
  return b;
}

/* ---------- 3. VOICE (Web Speech API + optional MP3 hooks) ---------- */
const synth = window.speechSynthesis;
let voices = [], voiceToken = 0;
function loadVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

function pickVoice(lang) {
  const prefixes = lang === 'fil' ? ['fil', 'tl'] : ['en'];
  return voices.find(v => prefixes.some(p => v.lang.toLowerCase().startsWith(p))) || null;
}
function speakOne(text, lang) {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = lang === 'fil' ? 'fil-PH' : 'en-US'; }
    u.rate = 0.8; u.pitch = 1.3;               // slow, friendly, higher voice
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
    setTimeout(resolve, 6000);                 // safety: never hang
  });
}
function playFile(path) {
  return new Promise((resolve) => {
    const a = new Audio(path);
    a.onended = () => resolve(true);
    a.onerror = () => resolve(false);
    a.play().catch(() => resolve(false));
  });
}
async function say(lang, text, fileKey) {
  if (CONFIG.USE_RECORDED_AUDIO && fileKey && await playFile(`audio/${lang}/${fileKey}.mp3`)) return;
  await speakOne(text, lang);
}
/* Speak lines in order; a newer call cancels any older sequence. */
async function sayLines(lines) {
  const token = ++voiceToken;
  if (synth) synth.cancel();
  for (const ln of lines) {
    if (token !== voiceToken) return;
    await say(ln.lang, ln.text, ln.key);
  }
}
const promptLines = (k) => langs().map(l => ({ lang: l, text: PROMPTS[k][l], key: 'prompt_' + k }));

/* ---------- 4. MUSIC & SFX (all generated with Web Audio — no files) ---------- */
let ac, musicTimer = null, step = 0;
function audioCtx() {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, t, dur, type, vol, endFreq) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const SCALE = [261.6, 293.7, 329.6, 392, 440, 523.3];          // C major pentatonic = always sounds happy
const MELODY = [0,2,4,2,5,4,2,1, 0,2,4,5,4,2,1,0];
function startMusic() {
  if (musicTimer || !state.musicOn) return;
  audioCtx();
  musicTimer = setInterval(() => {
    const t = ac.currentTime + 0.05, n = MELODY[step % MELODY.length];
    tone(SCALE[n], t, 0.35, 'triangle', CONFIG.MUSIC_VOLUME);
    if (step % 4 === 0) tone(SCALE[0] / 2, t, 0.7, 'sine', CONFIG.MUSIC_VOLUME * 1.4);
    step++;
  }, 380);
}
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
function toggleMusic() {
  state.musicOn = !state.musicOn;
  document.querySelectorAll('#btn-music, #btn-music-welcome').forEach(b => {
    b.textContent = state.musicOn ? '🎵' : '🔇'; b.classList.toggle('off', !state.musicOn);
  });
  state.musicOn ? startMusic() : stopMusic();
}
function sfx(kind) {
  if (!state.musicOn) return;                                   // mute also silences effects
  audioCtx(); const t = ac.currentTime;
  if (kind === 'pop') tone(420, t, 0.18, 'sine', 0.18, 980);   // bubbly pop
  if (kind === 'cheer') [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.09, 0.3, 'square', 0.05));
}

/* ---------- 5. EFFECTS ---------- */
function confetti(x, y, count = 16) {
  const fx = $('#fx'), bits = ['⭐', '🎉', '✨', '🎊', '💛'];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'bit'; s.textContent = bits[i % bits.length];
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', (Math.random() * 400 - 200) + 'px');
    fx.appendChild(s); setTimeout(() => s.remove(), 1500);
  }
}
function banner(emoji) {                                         // big celebration
  const b = document.createElement('div');
  b.className = 'banner'; b.textContent = emoji; $('#fx').appendChild(b);
  setTimeout(() => b.remove(), 1900);
}
function celebrate(el, big) {
  const r = el.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top + r.height / 2, big ? 40 : 16);
  sfx(big ? 'cheer' : 'pop');
  el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
  if (big) { banner('🌟'); sfx('cheer'); }
}
function addStar(activity) {
  state.stars++;
  $('#star-count').textContent = state.stars;
  const b = $('#star-badge'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  log(activity, 1);
}

/* ---------- 6. PROGRESS LOGGING (silent, queued offline) ---------- */
function log(activity, stars) {
  if (!state.avatar) return;
  const entry = {
    codename: state.avatar.name, avatar: state.avatar.emoji, language: state.lang,
    activity, stars: stars || 0, timestamp: new Date().toISOString(), sessionId: state.sessionId
  };
  const q = JSON.parse(localStorage.getItem('yella_queue') || '[]');
  q.push(entry); localStorage.setItem('yella_queue', JSON.stringify(q));
  flushQueue();
}
async function flushQueue() {
  if (!CONFIG.APPS_SCRIPT_URL) return;                           // not configured yet: keep in queue
  const q = JSON.parse(localStorage.getItem('yella_queue') || '[]');
  if (!q.length) return;
  try {
    // text/plain = "simple" CORS request (no preflight, which Apps Script can't answer).
    await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ entries: q })
    });
    localStorage.removeItem('yella_queue');                      // no-cors = opaque; assume sent
  } catch (e) { /* offline: retry on next log */ }
}

/* ---------- 7. SCREENS ---------- */
let current = 'welcome';
function show(name) {
  current = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  $('#topbar').hidden = (name === 'welcome');
  $('#btn-music-welcome').hidden = (name !== 'welcome');
  if (PROMPTS[name]) sayLines(promptLines(name));
}

function buildWelcome() {
  const s = $('#screen-welcome'); s.innerHTML = '';
  const y = document.createElement('div'); y.className = 'yella'; y.appendChild(art('yella', '🦜')); s.appendChild(y);

  const row = document.createElement('div'); row.className = 'lang-row';
  [['en', '🇬🇧'], ['fil', '🇵🇭'], ['bilingual', '🌏']].forEach(([code, flag]) => {
    const b = btn('lang' + (state.lang === code ? ' sel' : ''), 'lang-' + code, flag, () => {
      state.lang = code; sfx('pop');
      row.querySelectorAll('.lang').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
      sayLines(promptLines('welcome'));
    });
    row.appendChild(b);
  });
  s.appendChild(row);

  const grid = document.createElement('div'); grid.className = 'grid';
  AVATARS.forEach(a => grid.appendChild(btn('big avatar', 'avatar-' + a.id, a.emoji, (b) => {
    state.avatar = a; celebrate(b, false);
    log('start', 0);
    sayLines([{ lang: 'en', text: a.name }]).then(() => { buildMap(); show('map'); });
  })));
  s.appendChild(grid);
}

function buildMap() {
  const s = $('#screen-map'); s.innerHTML = '';
  const map = document.createElement('div'); map.className = 'map';
  map.innerHTML = '<svg viewBox="0 0 400 400" preserveAspectRatio="none"><path d="M120 110 C 300 120, 60 250, 280 300"/></svg>';
  const y = document.createElement('div'); y.className = 'yella'; y.appendChild(art('yella', '🦜')); map.appendChild(y);
  const rowOf = (a, b) => { const r = document.createElement('div'); r.className = 'row'; r.append(a, b); return r; };
  map.appendChild(btn('big dest sounds', 'island-sounds', '🏝️', () => { buildSounds(); show('sounds'); },
    rowOf(art('dest-sounds-1', '🔤'), art('dest-sounds-2', '🦜'))));
  map.appendChild(btn('big dest numbers', 'jungle-numbers', '🌴', () => { buildNumbers(); show('numbers'); },
    rowOf(art('dest-numbers-1', '🔢'), art('dest-numbers-2', '🍌'))));
  s.appendChild(map);
}

function buildSounds() {
  const s = $('#screen-sounds'); s.innerHTML = ''; state.tapped.clear();
  const grid = document.createElement('div'); grid.className = 'grid';
  LETTERS.forEach(L => {
    const ch = document.createElement('span'); ch.className = 'ch'; ch.textContent = L.l;
    grid.appendChild(btn('big letter', 'word-' + L.key, L.emoji, (b) => {
      celebrate(b, false); b.classList.add('done');
      // Letter name + phonic sound once, then the word in each chosen language
      const first = langs()[0];
      const lines = [{ lang: first, text: L.l, key: 'letter_' + L.l }, { lang: first, text: L.sound, key: 'sound_' + L.l }];
      langs().forEach(l => lines.push({ lang: l, text: L[l], key: 'word_' + L.key }));
      sayLines(lines);
      addStar('sound_' + L.l);
      state.tapped.add(L.l);
      if (state.tapped.size === LETTERS.length) {                // mini-game complete
        setTimeout(() => { celebrate(b, true); sayLines(promptLines('praise')); log('island_of_sounds_complete', 0);
          setTimeout(() => show('map'), 4500); }, 3500);
      }
    }, ch));
  });
  s.appendChild(grid);
}

let round = 0;
function buildNumbers() { round = 1; renderRound(); }
function renderRound() {
  const s = $('#screen-numbers'); s.innerHTML = '';
  const n = round, fruit = FRUITS[(n - 1) % FRUITS.length];
  const counter = document.createElement('div'); counter.className = 'counter'; counter.textContent = '\u00A0';
  const row = document.createElement('div'); row.className = 'fruits';
  let counted = 0;
  for (let i = 0; i < n; i++) {
    row.appendChild(btn('big fruit', 'fruit-' + (n - 1), fruit, (b) => {
      if (b.classList.contains('counted')) return;
      b.classList.add('counted'); celebrate(b, false);
      counted++; counter.textContent = counted;
      sayLines(langs().map(l => ({ lang: l, text: NUM_WORDS[l][counted - 1], key: 'num_' + counted })));
      if (counted === n) {                                       // round finished
        addStar('count_' + n);
        setTimeout(() => {
          celebrate(b, n === 5); sayLines(promptLines('praise'));
          setTimeout(() => {
            if (n < 5) { round++; renderRound(); sayLines(promptLines('numbers')); }
            else { log('number_jungle_complete', 0); show('map'); }
          }, 3000);
        }, 1800);
      }
    }));
  }
  s.append(counter, row);
}

/* ---------- 8. BOOT ---------- */
function init() {
  buildWelcome(); show('welcome');
  $('#btn-home').addEventListener('click', () => {
    if (current === 'map') { buildWelcome(); show('welcome'); } else { show('map'); }
  });
  ['#btn-music', '#btn-music-welcome'].forEach(id => $(id).addEventListener('click', toggleMusic));
  // Browsers block audio until the first touch: start music + greeting then.
  document.addEventListener('pointerdown', function first() {
    startMusic(); sayLines(promptLines('welcome'));
    document.removeEventListener('pointerdown', first);
  }, { once: true });
  window.addEventListener('online', flushQueue);
  flushQueue();
}
document.addEventListener('DOMContentLoaded', init);
