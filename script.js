const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain();
master.gain.value = 0.8;
master.connect(ctx.destination);

// ---------- Sound building blocks ----------
function noise(t, dur, type, freq, vol, q = 1) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function tone(t, f0, f1, dur, vol, wave = "sine") {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur);
}

// ---------- The drums (12 pads) ----------
const drums = [
  { key: "q", name: "Kick",       play: t => { tone(t, 160, 40, 0.5, 1); noise(t, 0.02, "lowpass", 3000, 0.4); } },
  { key: "w", name: "Snare",      play: t => { noise(t, 0.2, "highpass", 1200, 0.8); tone(t, 220, 110, 0.1, 0.5, "triangle"); } },
  { key: "e", name: "Hi-Hat",     play: t => noise(t, 0.06, "highpass", 8000, 0.6) },
  { key: "r", name: "Open Hat",   play: t => noise(t, 0.4, "highpass", 7000, 0.5) },
  { key: "a", name: "Tom High",   play: t => tone(t, 300, 140, 0.3, 0.9) },
  { key: "s", name: "Tom Mid",    play: t => tone(t, 220, 100, 0.35, 0.9) },
  { key: "d", name: "Tom Low",    play: t => tone(t, 150, 65, 0.45, 1) },
  { key: "f", name: "Clap",       play: t => { [0, 0.012, 0.024].forEach(o => noise(t + o, 0.05, "bandpass", 1500, 0.8, 2)); noise(t + 0.03, 0.15, "bandpass", 1500, 0.7, 2); } },
  { key: "z", name: "Crash",      play: t => noise(t, 1.4, "highpass", 4500, 0.5) },
  { key: "x", name: "Ride",       play: t => { noise(t, 0.7, "highpass", 9000, 0.35); tone(t, 5200, 5000, 0.5, 0.08, "triangle"); } },
  { key: "c", name: "Rim Shot",   play: t => { tone(t, 1700, 900, 0.04, 0.6, "square"); noise(t, 0.05, "bandpass", 2500, 0.5); } },
  { key: "v", name: "Cowbell",    play: t => { tone(t, 560, 560, 0.3, 0.3, "square"); tone(t, 845, 845, 0.3, 0.3, "square"); } }
];

// ---------- Pads ----------
const kit = document.getElementById("kit");

function flash(i) {
  const pad = kit.children[i];
  pad.classList.add("active");
  setTimeout(() => pad.classList.remove("active"), 100);
}

function hit(i) {
  if (ctx.state === "suspended") ctx.resume();
  drums[i].play(ctx.currentTime);
  flash(i);
}

drums.forEach((drum, i) => {
  const pad = document.createElement("div");
  pad.className = "pad";
  pad.innerHTML = `<kbd>${drum.key.toUpperCase()}</kbd><span>${drum.name}</span>`;
  pad.addEventListener("pointerdown", () => hit(i));
  kit.appendChild(pad);
});

document.addEventListener("keydown", e => {
  if (e.repeat || e.target.tagName === "INPUT") return;
  const i = drums.findIndex(d => d.key === e.key.toLowerCase());
  if (i !== -1) hit(i);
});

document.getElementById("volume").addEventListener("input", e => {
  master.gain.value = parseFloat(e.target.value);
});

// ---------- Sequencer (16 steps) ----------
const STEPS = 16;
const pattern = drums.map(() => Array(STEPS).fill(false));
const seqEl = document.getElementById("sequencer");
const stepEls = [];

// Starter rock beat
[0, 8].forEach(s => pattern[0][s] = true);
[4, 12].forEach(s => pattern[1][s] = true);
for (let s = 0; s < STEPS; s += 2) pattern[2][s] = true;

drums.forEach((drum, r) => {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<div class="label">${drum.name}</div>`;
  stepEls[r] = [];
  for (let s = 0; s < STEPS; s++) {
    const b = document.createElement("button");
    b.className = "step" + (s % 4 === 0 ? " beat" : "") + (pattern[r][s] ? " on" : "");
    b.addEventListener("click", () => {
      pattern[r][s] = !pattern[r][s];
      b.classList.toggle("on", pattern[r][s]);
    });
    stepEls[r][s] = b;
    row.appendChild(b);
  }
  seqEl.appendChild(row);
});

let bpm = 110, step = 0, nextTime = 0, timer = null;
const playBtn = document.getElementById("play");

function showStep(s, delayMs) {
  setTimeout(() => {
    stepEls.forEach(row => row.forEach((el, i) => el.classList.toggle("playing", i === s)));
  }, Math.max(0, delayMs));
}

function scheduler() {
  while (nextTime < ctx.currentTime + 0.1) {
    drums.forEach((drum, r) => { if (pattern[r][step]) drum.play(nextTime); });
    showStep(step, (nextTime - ctx.currentTime) * 1000);
    nextTime += 60 / bpm / 4;
    step = (step + 1) % STEPS;
  }
}

function start() {
  if (ctx.state === "suspended") ctx.resume();
  step = 0;
  nextTime = ctx.currentTime + 0.05;
  timer = setInterval(scheduler, 25);
  playBtn.textContent = "■ Stop";
  playBtn.classList.add("on");
}

function stop() {
  clearInterval(timer);
  timer = null;
  stepEls.forEach(row => row.forEach(el => el.classList.remove("playing")));
  playBtn.textContent = "▶ Play";
  playBtn.classList.remove("on");
}

playBtn.addEventListener("click", () => (timer ? stop() : start()));

document.getElementById("clear").addEventListener("click", () => {
  pattern.forEach((row, r) => row.fill(false));
  stepEls.forEach(row => row.forEach(el => el.classList.remove("on")));
});

document.getElementById("bpm").addEventListener("input", e => {
  bpm = parseInt(e.target.value, 10);
  document.getElementById("bpmValue").textContent = bpm;
});
