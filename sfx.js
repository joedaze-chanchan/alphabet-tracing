// 효과음: 파일 없이 Web Audio로 만든다. 첫 사용자 터치 뒤에 unlock()을 불러야 소리가 난다.

let ctx = null;

export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

function ready() {
  if (!ctx) unlock();
  return ctx && ctx.state === "running" ? ctx : null;
}

function tone(freq, duration, { type = "sine", gain = 0.25, slideTo = null, at = 0 } = {}) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}

function noise(duration, { gain = 0.5, at = 0, lowpass = 1200 } = {}) {
  const c = ready();
  if (!c) return;
  const t0 = c.currentTime + at;
  const len = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

// 쾅! 충돌: 낮은 쿵 + 부서지는 잡음
export function crash() {
  noise(0.5, { gain: 0.8, lowpass: 900 });
  tone(120, 0.45, { type: "square", gain: 0.3, slideTo: 40 });
  tone(60, 0.6, { type: "sine", gain: 0.5, slideTo: 25 });
}

// 정답 통과: 밝은 두 음
export function success() {
  tone(660, 0.12, { type: "triangle", gain: 0.25 });
  tone(990, 0.22, { type: "triangle", gain: 0.25, at: 0.11 });
}

// 코인
export function coin() {
  tone(1320, 0.08, { type: "square", gain: 0.12 });
  tone(1760, 0.14, { type: "square", gain: 0.12, at: 0.07 });
}

// 떨어지는 소리 (점점 낮아짐)
export function fall() {
  tone(500, 0.9, { type: "sawtooth", gain: 0.12, slideTo: 80 });
}
