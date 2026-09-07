import { LETTERS, LETTER_ORDER, STROKE_WIDTH } from "./letters.js";
import { buildPath, StrokeTracer } from "./tracer.js";
import { ProgressStore } from "./progress.js";

const COLORS = {
  outline: "#b9b3a6",
  outlineFill: "#fbfaf6",
  demo: "#3b82f6",
  user: "#22c55e",
  wrong: "#ef4444",
  startDot: "#3b82f6",
};

const DEMO_SPEED = 90; // 초당 진행 거리 (좌표 단위)
const DEMO_PAUSE = 350; // 획 사이 멈춤 (ms)
const WRONG_FLASH = 550; // 오답 빨간 표시 시간 (ms)
const MAX_WRONG_STREAK = 3;

const HINTS = {
  watch: "시범을 잘 보세요",
  trace: "파란 점에서 시작해 따라 써 보세요",
  good: "좋아요! 다음 획",
  start: "파란 점에서 시작하세요",
  off: "선 밖으로 나갔어요. 획을 따라 그리세요",
  short: "끝까지 그리세요",
  replay: "시범을 다시 보여 줄게요",
};

const $ = (id) => document.getElementById(id);
const els = {
  home: $("home"),
  practice: $("practice"),
  grid: $("letter-grid"),
  resetBtn: $("reset-btn"),
  backBtn: $("back-btn"),
  demoBtn: $("demo-btn"),
  dots: $("stroke-dots"),
  canvas: $("canvas"),
  hint: $("hint"),
  label: $("letter-label"),
  done: $("done"),
  doneText: $("done-text"),
  againBtn: $("again-btn"),
  nextBtn: $("next-btn"),
};

const store = new ProgressStore();
const ctx = els.canvas.getContext("2d");

const state = {
  letter: null,
  paths: [], // 획별 재표본 경로
  strokeIndex: 0,
  mode: "idle", // idle | demo | trace | done
  tracer: null,
  liveProgress: 0, // 현재 그리는 획의 진행도
  liveColor: COLORS.user,
  demoProgress: null, // 시범 중: { index, t }
  wrongStreak: 0,
  wrongsTotal: 0,
  demoToken: 0,
  raf: 0,
};

// ---------- 홈 ----------

function renderHome() {
  els.grid.innerHTML = "";
  for (const letter of LETTER_ORDER) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "letter-btn";
    const big = document.createElement("span");
    big.textContent = letter;
    const ko = document.createElement("span");
    ko.className = "ko";
    ko.textContent = LETTERS[letter].ko;
    btn.append(big, ko);
    if (store.get(letter).completed) {
      btn.classList.add("completed");
      const star = document.createElement("span");
      star.className = "star";
      star.textContent = "★";
      btn.appendChild(star);
    }
    btn.addEventListener("click", () => openLetter(letter));
    els.grid.appendChild(btn);
  }
}

function showHome() {
  cancelDemo();
  cancelAnimationFrame(state.raf);
  state.mode = "idle";
  els.practice.hidden = true;
  els.home.hidden = false;
  renderHome();
}

// ---------- 연습 ----------

function openLetter(letter) {
  state.letter = letter;
  state.paths = LETTERS[letter].strokes.map((s) => buildPath(s, 1));
  state.strokeIndex = 0;
  state.wrongStreak = 0;
  state.wrongsTotal = 0;
  state.liveProgress = 0;
  state.tracer = null;
  els.done.hidden = true;
  els.home.hidden = true;
  els.practice.hidden = false;
  els.label.innerHTML = `<span class="big">${letter}</span><span class="ko">${LETTERS[letter].ko}</span>`;
  resizeCanvas();
  renderDots();
  setHint(HINTS.watch);
  startLoop();
  runDemo().then((finished) => {
    if (finished) beginTrace();
  });
}

function beginTrace() {
  state.mode = "trace";
  state.tracer = new StrokeTracer(state.paths[state.strokeIndex], STROKE_WIDTH);
  state.liveProgress = 0;
  state.liveColor = COLORS.user;
  renderDots();
  setHint(HINTS.trace);
}

function setHint(text, kind = "") {
  els.hint.textContent = text;
  els.hint.className = "hint " + kind;
}

function renderDots() {
  els.dots.innerHTML = "";
  state.paths.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = "dot";
    if (i < state.strokeIndex) d.classList.add("filled");
    else if (i === state.strokeIndex && state.mode === "trace") d.classList.add("current");
    els.dots.appendChild(d);
  });
}

// ---------- 시범 ----------

function cancelDemo() {
  state.demoToken++;
  state.demoProgress = null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 시범을 끝까지 재생하면 true, 중간에 취소되면(다른 글자로 이동 등) false.
async function runDemo() {
  cancelDemo();
  const token = state.demoToken;
  state.mode = "demo";
  renderDots();
  setHint(HINTS.watch);
  for (let i = 0; i < state.paths.length; i++) {
    const total = pathLength(LETTERS[state.letter].strokes[i]);
    const duration = (total / DEMO_SPEED) * 1000;
    const startAt = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        if (token !== state.demoToken) return resolve();
        const t = Math.min(1, (now - startAt) / duration);
        state.demoProgress = { index: i, t };
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    if (token !== state.demoToken) return false;
    await sleep(DEMO_PAUSE);
    if (token !== state.demoToken) return false;
  }
  await sleep(400);
  if (token !== state.demoToken) return false;
  state.demoProgress = null;
  return true;
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return len;
}

// ---------- 터치 ----------

function toLetterCoords(e) {
  const rect = els.canvas.getBoundingClientRect();
  return [((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100];
}

let pointerId = null;

function onPointerDown(e) {
  if (state.mode !== "trace" || pointerId !== null) return;
  e.preventDefault();
  pointerId = e.pointerId;
  try {
    els.canvas.setPointerCapture(pointerId);
  } catch {
    // 합성 이벤트 등 캡처 불가 시 무시
  }
  const [x, y] = toLetterCoords(e);
  const r = state.tracer.begin(x, y);
  if (!r.ok) {
    releasePointer();
    fail(r.reason, 0);
    return;
  }
  state.liveProgress = r.progress;
  state.liveColor = COLORS.user;
}

function onPointerMove(e) {
  if (state.mode !== "trace" || e.pointerId !== pointerId) return;
  e.preventDefault();
  const [x, y] = toLetterCoords(e);
  const r = state.tracer.move(x, y);
  if (!r.ok) {
    releasePointer();
    fail(r.reason, r.progress);
    return;
  }
  state.liveProgress = r.progress;
}

function onPointerUp(e) {
  if (state.mode !== "trace" || e.pointerId !== pointerId) return;
  e.preventDefault();
  releasePointer();
  const r = state.tracer.end();
  if (r.ok) succeed();
  else fail(r.reason, r.progress);
}

function releasePointer() {
  if (pointerId !== null) {
    try {
      els.canvas.releasePointerCapture(pointerId);
    } catch {
      // 이미 해제됨
    }
  }
  pointerId = null;
}

async function fail(reason, progress) {
  state.mode = "wrong";
  state.wrongStreak++;
  state.wrongsTotal++;
  state.liveProgress = progress;
  state.liveColor = COLORS.wrong;
  setHint(HINTS[reason] || HINTS.off, "bad");
  await sleep(WRONG_FLASH);
  if (state.mode !== "wrong") return;
  state.liveProgress = 0;
  if (state.wrongStreak >= MAX_WRONG_STREAK) {
    state.wrongStreak = 0;
    setHint(HINTS.replay, "bad");
    await sleep(600);
    if (state.mode !== "wrong") return;
    const finished = await runDemo();
    if (!finished) return;
  }
  beginTrace();
}

function succeed() {
  state.wrongStreak = 0;
  state.strokeIndex++;
  state.liveProgress = 0;
  if (state.strokeIndex >= state.paths.length) {
    finishLetter();
    return;
  }
  setHint(HINTS.good, "ok");
  beginTrace();
  setHint(HINTS.good, "ok");
}

function finishLetter() {
  state.mode = "done";
  renderDots();
  store.recordAttempt(state.letter, state.wrongsTotal);
  store.markCompleted(state.letter);
  setHint("완성!", "ok");
  const idx = LETTER_ORDER.indexOf(state.letter);
  const hasNext = idx < LETTER_ORDER.length - 1;
  els.doneText.textContent =
    state.wrongsTotal === 0 ? `${state.letter} 완성! 한 번도 안 틀렸어요` : `${state.letter} 완성! 틀린 횟수 ${state.wrongsTotal}번`;
  els.nextBtn.textContent = hasNext ? "다음 글자" : "홈으로";
  els.done.hidden = false;
}

// ---------- 렌더링 ----------

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const size = Math.round(rect.width * dpr);
  if (els.canvas.width !== size || els.canvas.height !== size) {
    els.canvas.width = size;
    els.canvas.height = size;
  }
}

function strokePath(path, t, width, color) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  let started = false;
  for (const p of path) {
    if (p.t > t + 1e-9) break;
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else ctx.lineTo(p.x, p.y);
  }
  if (started && t <= 0.001) ctx.lineTo(path[0].x + 0.01, path[0].y);
  ctx.stroke();
}

function render(now) {
  const size = els.canvas.width;
  const k = size / 100;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 100, 100);

  // 윤곽: 테두리 → 안쪽 채움 순서로 전체 획을 그린다
  for (const path of state.paths) strokePath(path, 1, STROKE_WIDTH + 3, COLORS.outline);
  for (const path of state.paths) strokePath(path, 1, STROKE_WIDTH, COLORS.outlineFill);

  if (state.demoProgress) {
    const { index, t } = state.demoProgress;
    for (let i = 0; i < index; i++) strokePath(state.paths[i], 1, STROKE_WIDTH, COLORS.demo);
    strokePath(state.paths[index], t, STROKE_WIDTH, COLORS.demo);
    return;
  }

  // 완료한 획
  for (let i = 0; i < state.strokeIndex; i++) strokePath(state.paths[i], 1, STROKE_WIDTH, COLORS.user);

  // 그리는 중인 획
  if ((state.mode === "trace" || state.mode === "wrong") && state.liveProgress > 0) {
    strokePath(state.paths[state.strokeIndex], state.liveProgress, STROKE_WIDTH, state.liveColor);
  }

  // 현재 획 시작점 (깜빡임)
  if (state.mode === "trace" && pointerId === null) {
    const p0 = state.paths[state.strokeIndex][0];
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, 4 + pulse * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.startDot;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, 4 + pulse * 2.5 + 3, 0, Math.PI * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = COLORS.startDot;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function startLoop() {
  cancelAnimationFrame(state.raf);
  const loop = (now) => {
    render(now);
    state.raf = requestAnimationFrame(loop);
  };
  state.raf = requestAnimationFrame(loop);
}

// ---------- 이벤트 ----------

els.canvas.addEventListener("pointerdown", onPointerDown);
els.canvas.addEventListener("pointermove", onPointerMove);
els.canvas.addEventListener("pointerup", onPointerUp);
els.canvas.addEventListener("pointercancel", onPointerUp);
els.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

els.backBtn.addEventListener("click", showHome);
els.demoBtn.addEventListener("click", () => {
  if (state.mode === "done" || state.mode === "idle") return;
  releasePointer();
  state.liveProgress = 0;
  runDemo().then((finished) => {
    if (finished) beginTrace();
  });
});
els.againBtn.addEventListener("click", () => openLetter(state.letter));
els.nextBtn.addEventListener("click", () => {
  const idx = LETTER_ORDER.indexOf(state.letter);
  if (idx < LETTER_ORDER.length - 1) openLetter(LETTER_ORDER[idx + 1]);
  else showHome();
});
els.resetBtn.addEventListener("click", () => {
  if (confirm("학습 기록을 모두 지울까요?")) {
    store.reset();
    renderHome();
  }
});
window.addEventListener("resize", () => {
  if (!els.practice.hidden) resizeCanvas();
});

renderHome();
