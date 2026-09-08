// 영어 단어 레이싱: 차 뒷모습을 보며 달린다. 위에 단어(또는 한글)가 뜨면 저 멀리 네 갈래 길과
// 간판 4개가 나타난다. 정답 간판 쪽 차선으로 가면 간판이 부서지며 통과, 오답이면 낭떠러지로 떨어진다.

import {
  LANES,
  LANE_CENTERS,
  ROAD_LIMIT,
  FORK_LIMIT,
  RACE_LIVES,
  STEER_SPEED,
  GAP_BEFORE_FORK,
  FORK_LENGTH,
  REST_AFTER,
  SCORE_PER_SIGN,
  RACE_DIFFICULTY,
  RACE_DIFFICULTY_ORDER,
  LANE_COLORS,
  makeQuestion,
  laneFromX,
  speedFor,
} from "./race-logic.js";

const $ = (id) => document.getElementById(id);

const FALL_MS = 1400;
const SHATTER_MS = 700;
const Z_NEAR = 2.6; // 투영용 카메라 거리 (클수록 원근이 완만해 먼 것이 크게 보인다)
const DRAW_DEPTH = 130; // 그리는 최대 거리 (도로 단위)

export function setupRace({ onExit, bestStore, resume }) {
  const els = {
    menu: $("race-menu"),
    play: $("race-play"),
    back: $("race-back"),
    diff: $("race-diff"),
    best: $("race-best"),
    start: $("race-start"),
    resumeBanner: $("race-resume"),
    resumeBannerText: $("race-resume-text"),
    resumeBannerBtn: $("race-resume-btn"),
    score: $("race-score"),
    lives: $("race-lives"),
    pause: $("race-pause"),
    canvas: $("road"),
    prompt: $("race-prompt"),
    promptWord: $("race-prompt-word"),
    promptQ: $("race-prompt-q"),
    choices: $("race-choices"),
    msg: $("race-msg"),
    left: $("race-left"),
    right: $("race-right"),
    over: $("race-over"),
    overTitle: $("ro-title"),
    overScore: $("ro-score"),
    overCount: $("ro-count"),
    overBest: $("ro-best"),
    overRetry: $("ro-retry"),
    overMenu: $("ro-menu"),
    paused: $("race-paused"),
    resumeBtn: $("ro-resume"),
    quit: $("ro-quit"),
  };
  const ctx = els.canvas.getContext("2d");
  if (typeof ctx.roundRect !== "function") {
    ctx.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
    };
  }

  let level = "easy";
  let g = null;
  let raf = 0;
  let lastTs = 0;
  const pointers = new Map(); // pointerId -> "left" | "right"

  // ---------- 메뉴 ----------

  function renderMenu() {
    els.diff.innerHTML = "";
    for (const key of RACE_DIFFICULTY_ORDER) {
      const d = RACE_DIFFICULTY[key];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "diff-btn" + (key === level ? " selected" : "");
      b.innerHTML = `<b>${d.label}</b><small>${d.desc}</small>`;
      b.addEventListener("click", () => {
        level = key;
        renderMenu();
      });
      els.diff.appendChild(b);
    }
    const best = bestStore.get(level);
    els.best.textContent = best > 0 ? `최고 점수 ${best}점` : "아직 기록이 없어요";
    const saved = resume ? resume.get() : null;
    if (saved && RACE_DIFFICULTY[saved.level]) {
      const hearts = "♥".repeat(saved.lives) + "♡".repeat(Math.max(0, RACE_LIVES - saved.lives));
      els.resumeBannerText.textContent = `${RACE_DIFFICULTY[saved.level].label} · ${saved.score}점 · ${hearts} · 통과 ${saved.correct}개`;
      els.resumeBanner.hidden = false;
    } else {
      els.resumeBanner.hidden = true;
    }
  }

  function saveState() {
    if (!resume || !g || g.over) return;
    resume.set({ level, score: g.score, lives: g.lives, correct: g.correct, lastWord: g.lastWord, dir: g.dir });
  }

  function showMenu() {
    stopLoop();
    g = null;
    els.play.hidden = true;
    els.menu.hidden = false;
    renderMenu();
  }

  // ---------- 게임 상태 ----------

  function newGame(saved = null) {
    if (saved && RACE_DIFFICULTY[saved.level]) level = saved.level;
    g = {
      d: RACE_DIFFICULTY[level],
      score: saved ? saved.score || 0 : 0,
      lives: saved ? Math.max(1, Math.min(RACE_LIVES, saved.lives || RACE_LIVES)) : RACE_LIVES,
      correct: saved ? saved.correct || 0 : 0,
      lastWord: saved ? saved.lastWord || null : null,
      dir: saved && saved.dir ? saved.dir : "en2ko",
      x: 0, // 차의 도로 좌표
      steer: 0, // -1 | 0 | 1
      dist: 0, // 달린 거리 (도로 단위)
      q: null, // 현재 문제 { ..., z: 간판까지 남은 거리 }
      nextQAt: 40, // 다음 문제가 뜨는 거리
      state: "drive", // drive | fall | shatter
      stateUntil: 0,
      shatter: null, // { lane, parts: [...] }
      fallX: 0,
      paused: false,
      over: false,
      curve: 0,
      curveTarget: 0,
      nextCurveAt: 0,
      props: [], // 길가 장식 { z, side, kind }
      nextPropAt: 0,
      tilt: 0,
    };
    els.over.hidden = true;
    els.paused.hidden = true;
    els.menu.hidden = true;
    els.play.hidden = false;
    els.prompt.hidden = true;
    resize();
    renderHud();
    setMsg(saved ? "이어서 출발! 위에 뜨는 단어를 잘 보세요" : "출발! 위에 뜨는 단어를 잘 보세요");
    lastTs = 0;
    if (!saved && resume) resume.clear();
    saveState();
    startLoop();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w > 0 && (els.canvas.width !== w || els.canvas.height !== h)) {
      els.canvas.width = w;
      els.canvas.height = h;
    }
  }

  function size() {
    const dpr = window.devicePixelRatio || 1;
    return { w: els.canvas.width / dpr, h: els.canvas.height / dpr, dpr };
  }

  function spawnQuestion() {
    const q = makeQuestion(level, g.lastWord, g.dir);
    g.lastWord = q.en;
    g.dir = g.dir === "en2ko" ? "ko2en" : "en2ko";
    q.z = GAP_BEFORE_FORK + FORK_LENGTH; // 간판까지 거리
    g.q = q;
    els.promptWord.textContent = q.prompt;
    els.promptWord.classList.toggle("ko", q.dir === "ko2en");
    els.promptQ.textContent = q.question;
    els.choices.innerHTML = q.signs
      .map((t, i) => `<span class="race-choice" style="border-color:${LANE_COLORS[i]};background:${LANE_COLORS[i]}22">${t}</span>`)
      .join("");
    els.prompt.hidden = false;
    setMsg("저 멀리 네 갈래 길! 맞는 간판 쪽으로 가세요");
  }

  function update(now, dt) {
    if (g.paused || g.over) return;
    const speed = speedFor(g.correct) * g.d.speedMul;

    // 커브: 가끔 방향을 바꾼다 (보기용)
    if (g.dist >= g.nextCurveAt) {
      g.curveTarget = (Math.random() - 0.5) * 0.8;
      g.nextCurveAt = g.dist + 60 + Math.random() * 60;
    }
    g.curve += (g.curveTarget - g.curve) * Math.min(1, dt * 0.8);

    if (g.state === "fall") {
      if (now >= g.stateUntil) afterFall();
      return;
    }

    // 달리기
    const advance = speed * dt;
    g.dist += advance;
    for (const p of g.props) p.z -= advance;
    g.props = g.props.filter((p) => p.z > -2);
    if (g.dist >= g.nextPropAt) {
      g.props.push({ z: DRAW_DEPTH, side: Math.random() < 0.5 ? -1 : 1, kind: Math.floor(Math.random() * 3), off: 1.4 + Math.random() * 1.2 });
      g.nextPropAt = g.dist + 6 + Math.random() * 8;
    }

    // 조작
    const limit = g.q && g.q.z < FORK_LENGTH + 6 ? FORK_LIMIT : ROAD_LIMIT;
    g.x += g.steer * STEER_SPEED * dt;
    g.x = Math.max(-limit, Math.min(limit, g.x));
    g.tilt += (g.steer * 0.18 - g.tilt) * Math.min(1, dt * 8);

    if (g.state === "shatter" && now >= g.stateUntil) {
      g.state = "drive";
      g.shatter = null;
    }

    // 문제
    if (!g.q && g.dist >= g.nextQAt) spawnQuestion();
    if (g.q) {
      g.q.z -= advance;
      if (g.q.z <= 0) judge(now);
    }
  }

  function judge(now) {
    const q = g.q;
    const lane = laneFromX(g.x);
    if (lane === q.answer) {
      g.correct += 1;
      g.score += SCORE_PER_SIGN;
      g.state = "shatter";
      g.stateUntil = now + SHATTER_MS;
      g.shatter = { lane, seed: Math.random() * 100, start: now };
      setMsg(`정답! ${q.signs[q.answer]} 통과 +${SCORE_PER_SIGN}점`, "ok");
      renderHud();
      g.q = null;
      g.nextQAt = g.dist + REST_AFTER;
      els.prompt.hidden = true;
      saveState();
    } else {
      g.state = "fall";
      g.stateUntil = now + FALL_MS;
      g.fallX = g.x;
      g.fallLane = lane;
      setMsg(`앗! ${q.signs[lane]} 은(는) 아니에요. 정답은 ${q.signs[q.answer]}`, "bad");
    }
  }

  function afterFall() {
    g.lives -= 1;
    g.q = null;
    g.x = 0;
    g.state = "drive";
    g.nextQAt = g.dist + REST_AFTER;
    els.prompt.hidden = true;
    renderHud();
    if (g.lives <= 0) {
      gameOver();
      return;
    }
    setMsg("다시 달려요! 이번엔 잘 보고 고르세요");
    saveState();
  }

  function gameOver() {
    g.over = true;
    if (resume) resume.clear();
    const best = bestStore.update(level, g.score);
    els.overTitle.textContent = g.score >= best && g.score > 0 ? "최고 기록!" : "경주 끝";
    els.overScore.textContent = `${g.score}점`;
    els.overCount.textContent = `간판 ${g.correct}개 통과`;
    els.overBest.textContent = `최고 점수 ${best}점`;
    els.over.hidden = false;
  }

  function renderHud() {
    els.score.textContent = `${g.score}점`;
    els.lives.textContent = "♥".repeat(g.lives) + "♡".repeat(Math.max(0, RACE_LIVES - g.lives));
  }

  function setMsg(text, kind = "") {
    els.msg.textContent = text;
    els.msg.className = "game-msg " + kind;
  }

  // ---------- 투영 ----------

  // 도로 좌표(x: 좌우, z: 앞쪽 거리) → 화면 좌표. 카메라는 차 바로 뒤 위.
  function project(x, z) {
    const { w, h } = size();
    const horizon = h * 0.4;
    const s = Z_NEAR / (z + Z_NEAR); // 가까울수록 1, 멀수록 0
    const camX = g.x; // 카메라가 차를 따라간다
    const roadHalf = w * 0.42;
    const curveShift = g.curve * z * z * 0.045;
    const sx = w / 2 + (x - camX * 0.85) * roadHalf * s + curveShift * s;
    const sy = horizon + (h - horizon) * s;
    return { x: sx, y: sy, s };
  }

  function halfWidthAt(z) {
    // 네 갈래 구간에서는 도로가 두 배로 넓어진다
    const q = g.q;
    if (!q) return ROAD_LIMIT;
    const dz = q.z - z; // 이 지점이 간판보다 얼마나 앞(카메라 쪽)인지. z=q.z가 간판.
    // z가 [q.z - FORK_LENGTH, q.z] 사이면 네 갈래
    if (z >= q.z - FORK_LENGTH && z <= q.z + 2) return FORK_LIMIT;
    // 그 앞 6단위는 서서히 넓어짐
    if (z >= q.z - FORK_LENGTH - 6 && z < q.z - FORK_LENGTH) {
      const t = (z - (q.z - FORK_LENGTH - 6)) / 6;
      return ROAD_LIMIT + (FORK_LIMIT - ROAD_LIMIT) * t;
    }
    void dz;
    return ROAD_LIMIT;
  }

  // ---------- 그리기 ----------

  function draw(now) {
    const { w, h, dpr } = size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const horizon = h * 0.4;

    // 하늘
    const skyG = ctx.createLinearGradient(0, 0, 0, horizon);
    skyG.addColorStop(0, "#38bdf8");
    skyG.addColorStop(1, "#bae6fd");
    ctx.fillStyle = skyG;
    ctx.fillRect(0, 0, w, horizon);
    // 구름과 해
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(w * 0.8, horizon * 0.35, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 173 + g.dist * 0.4) % (w + 120)) - 60;
      const cy = horizon * (0.25 + (i % 2) * 0.3);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 34, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 20, cy - 6, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 먼 산
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let i = 0; i <= 8; i++) {
      const mx = (w / 8) * i;
      const my = horizon - 18 - Math.abs(Math.sin(i * 1.7 + 1)) * 34;
      ctx.lineTo(mx, my);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();

    // 땅
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(0, horizon, w, h - horizon);

    // 도로: 먼 곳부터 가까운 곳으로 띠를 그린다
    const steps = 60;
    let prev = null;
    const quad = (a, b, c, d, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    };
    for (let i = steps; i >= 0; i--) {
      const z = (i / steps) ** 2 * DRAW_DEPTH;
      const hw = halfWidthAt(z);
      const cur = { z, hw, at: (x) => project(x, z) };
      if (prev) {
        const band = Math.floor((z + g.dist) / 4) % 2 === 0;
        const asphalt = band ? "#475569" : "#52525b";
        const stripe = band ? "#f8fafc" : "#ef4444";
        const edge = 0.07; // 가장자리 줄 너비 (도로 단위)
        if (hw > ROAD_LIMIT + 0.01) {
          // 네 갈래: 길 네 개가 갈라진다 (사이는 풀밭 = 낭떠러지)
          const k = hw / FORK_LIMIT;
          const laneHalf = 0.62 * k;
          for (let n = 0; n < LANES; n++) {
            const c = LANE_CENTERS[n] * k;
            const laneStripe = band ? LANE_COLORS[n] : "#f8fafc";
            quad(prev.at(c - laneHalf), prev.at(c + laneHalf), cur.at(c + laneHalf), cur.at(c - laneHalf), asphalt);
            quad(prev.at(c - laneHalf), prev.at(c - laneHalf + edge * 1.6), cur.at(c - laneHalf + edge * 1.6), cur.at(c - laneHalf), laneStripe);
            quad(prev.at(c + laneHalf - edge * 1.6), prev.at(c + laneHalf), cur.at(c + laneHalf), cur.at(c + laneHalf - edge * 1.6), laneStripe);
          }
        } else {
          quad(prev.at(-hw), prev.at(hw), cur.at(hw), cur.at(-hw), asphalt);
          quad(prev.at(-hw), prev.at(-hw + edge), cur.at(-hw + edge), cur.at(-hw), stripe);
          quad(prev.at(hw - edge), prev.at(hw), cur.at(hw), cur.at(hw - edge), stripe);
          if (band) quad(prev.at(-0.03), prev.at(0.03), cur.at(0.03), cur.at(-0.03), "#fde047");
        }
      }
      prev = cur;
    }

    // 길가 장식 (멀리서 가까이)
    const props = [...g.props].sort((a, b) => b.z - a.z);
    for (const p of props) {
      if (p.z < 0.2 || p.z > DRAW_DEPTH) continue;
      const hw = halfWidthAt(p.z);
      const pt = project(p.side * (hw + p.off), p.z);
      drawProp(p, pt);
    }

    // 간판 (네 갈래 끝)
    if (g.q && g.q.z > 0.2 && g.q.z < DRAW_DEPTH) drawSigns(g.q, now);
    if (g.shatter) drawShatter(g.shatter, now);

    // 차
    drawCar(now);
  }

  function drawProp(p, pt) {
    const s = pt.s;
    if (p.kind === 0) {
      // 나무
      ctx.fillStyle = "#92400e";
      ctx.fillRect(pt.x - 4 * s, pt.y - 40 * s, 8 * s, 40 * s);
      ctx.fillStyle = "#16a34a";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - 48 * s, 26 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 1) {
      // 바위
      ctx.fillStyle = "#9ca3af";
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y - 8 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 표지판 기둥
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(pt.x - 2 * s, pt.y - 34 * s, 4 * s, 34 * s);
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - 40 * s, 9 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSigns(q, now) {
    const z = q.z;
    const s = Z_NEAR / (z + Z_NEAR);
    // 멀리서도 읽히게 최소 크기를 둔다
    const bw = Math.max(38, 190 * s);
    const bh = Math.max(22, 60 * s);
    const post = Math.max(10, 50 * s);
    const fontPx = Math.max(10, Math.min(26, 26 * s * 1.4));
    for (let i = 0; i < LANES; i++) {
      if (g.shatter && g.shatter.lane === i) continue;
      const pt = project(LANE_CENTERS[i], z);
      const top = pt.y - bh - post;
      ctx.fillStyle = "#78350f";
      ctx.fillRect(pt.x - Math.max(1.5, 4 * s), top + bh, Math.max(3, 8 * s), post);
      ctx.fillStyle = "#fffbeb";
      ctx.strokeStyle = LANE_COLORS[i];
      ctx.lineWidth = Math.max(2, 6 * s);
      ctx.beginPath();
      ctx.roundRect(pt.x - bw / 2, top, bw, bh, Math.max(4, 8 * s));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1c1917";
      ctx.font = `800 ${fontPx}px "Helvetica Neue", Arial, "Noto Sans KR", "Malgun Gothic", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(q.signs[i], pt.x, top + bh / 2);
    }
    void now;
  }

  function drawShatter(sh, now) {
    const t = Math.min(1, (now - sh.start) / SHATTER_MS);
    const pt = project(LANE_CENTERS[sh.lane], Math.max(0.2, 2 - t * 2));
    ctx.save();
    ctx.globalAlpha = 1 - t;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + sh.seed;
      const d = 20 + t * 140;
      const px = pt.x + Math.cos(a) * d;
      const py = pt.y - 60 + Math.sin(a) * d * 0.6 + t * t * 120;
      ctx.fillStyle = i % 2 ? "#fef3c7" : "#b45309";
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a + t * 6);
      ctx.fillRect(-9, -6, 18, 12);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.font = '900 30px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#fde047";
    ctx.strokeStyle = "#7c2d12";
    ctx.lineWidth = 5;
    ctx.strokeText("통과!", pt.x, pt.y - 120 - t * 40);
    ctx.fillText("통과!", pt.x, pt.y - 120 - t * 40);
    ctx.restore();
  }

  function drawCar(now) {
    const { w, h } = size();
    const pt = project(g.x, 0.15);
    let cx = pt.x;
    let cy = h - 26;
    let scale = 1;
    let rot = g.tilt;
    let alpha = 1;
    if (g.state === "fall") {
      const t = Math.min(1, (g.stateUntil - now) / FALL_MS);
      const k = 1 - t; // 0 → 1 진행
      scale = 1 - k * 0.7;
      cy = h - 26 + k * k * 260;
      cx += (g.fallX >= 0 ? 1 : -1) * k * 90;
      rot = k * (g.fallX >= 0 ? 1.4 : -1.4);
      alpha = 1 - k * 0.6;
    }
    const cw = w * 0.26 * scale;
    const ch = cw * 0.62;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    // 그림자
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 4, cw * 0.55, ch * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // 바퀴
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.roundRect(-cw * 0.5, -ch * 0.25, cw * 0.16, ch * 0.42, 5);
    ctx.roundRect(cw * 0.34, -ch * 0.25, cw * 0.16, ch * 0.42, 5);
    ctx.fill();
    // 차체
    const body = ctx.createLinearGradient(0, -ch, 0, 0);
    body.addColorStop(0, "#fb7185");
    body.addColorStop(1, "#be123c");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-cw * 0.45, -ch * 0.62, cw * 0.9, ch * 0.62, 12);
    ctx.fill();
    // 지붕과 뒷유리
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.roundRect(-cw * 0.32, -ch * 1.0, cw * 0.64, ch * 0.42, 10);
    ctx.fill();
    ctx.fillStyle = "#bae6fd";
    ctx.beginPath();
    ctx.roundRect(-cw * 0.27, -ch * 0.95, cw * 0.54, ch * 0.3, 8);
    ctx.fill();
    // 운전자 (뒷모습)
    ctx.fillStyle = "#fcd34d";
    ctx.beginPath();
    ctx.arc(0, -ch * 0.8, cw * 0.07, 0, Math.PI * 2);
    ctx.fill();
    // 미등
    const blink = 0.6 + 0.4 * Math.sin(now / 120);
    ctx.fillStyle = `rgba(254,240,138,${blink})`;
    ctx.beginPath();
    ctx.roundRect(-cw * 0.42, -ch * 0.5, cw * 0.14, ch * 0.14, 3);
    ctx.roundRect(cw * 0.28, -ch * 0.5, cw * 0.14, ch * 0.14, 3);
    ctx.fill();
    // 번호판
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(-cw * 0.12, -ch * 0.3, cw * 0.24, ch * 0.12);
    ctx.restore();
  }

  // ---------- 루프 ----------

  function frame(ts) {
    if (!g) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    try {
      update(ts, dt);
      draw(ts);
    } catch (err) {
      setMsg(`오류: ${err && err.message ? err.message : err}`, "bad");
    }
    raf = requestAnimationFrame(frame);
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function setPaused(p) {
    if (!g || g.over) return;
    g.paused = p;
    els.paused.hidden = !p;
    lastTs = 0;
    if (p) {
      pointers.clear();
      g.steer = 0;
    }
  }

  // ---------- 조작 ----------

  function updateSteer() {
    if (!g) return;
    let dir = 0;
    for (const v of pointers.values()) dir = v === "left" ? -1 : 1; // 마지막 손가락 우선
    g.steer = dir;
  }

  function sideOf(e) {
    const rect = els.canvas.getBoundingClientRect();
    return e.clientX - rect.left < rect.width / 2 ? "left" : "right";
  }

  els.canvas.addEventListener("pointerdown", (e) => {
    if (!g || g.paused || g.over) return;
    e.preventDefault();
    pointers.set(e.pointerId, sideOf(e));
    try {
      els.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 무시
    }
    updateSteer();
  });
  els.canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    pointers.set(e.pointerId, sideOf(e));
    updateSteer();
  });
  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    updateSteer();
  };
  els.canvas.addEventListener("pointerup", release);
  els.canvas.addEventListener("pointercancel", release);
  els.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // 화살표 버튼: 누르고 있는 동안 조작
  for (const [btn, dir] of [
    [els.left, "left"],
    [els.right, "right"],
  ]) {
    btn.addEventListener("pointerdown", (e) => {
      if (!g || g.paused || g.over) return;
      e.preventDefault();
      pointers.set(`btn-${e.pointerId}`, dir);
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // 무시
      }
      updateSteer();
    });
    const rel = (e) => {
      pointers.delete(`btn-${e.pointerId}`);
      updateSteer();
    };
    btn.addEventListener("pointerup", rel);
    btn.addEventListener("pointercancel", rel);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  // 키보드(PC 테스트용)
  window.addEventListener("keydown", (e) => {
    if (!g || els.play.hidden) return;
    if (e.key === "ArrowLeft") pointers.set("key", "left");
    if (e.key === "ArrowRight") pointers.set("key", "right");
    updateSteer();
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      pointers.delete("key");
      updateSteer();
    }
  });

  els.back.addEventListener("click", () => {
    saveState();
    stopLoop();
    g = null;
    onExit();
  });
  els.start.addEventListener("click", () => newGame());
  els.resumeBannerBtn.addEventListener("click", () => {
    const saved = resume ? resume.get() : null;
    if (saved) newGame(saved);
  });
  els.pause.addEventListener("click", () => setPaused(true));
  els.resumeBtn.addEventListener("click", () => setPaused(false));
  els.quit.addEventListener("click", () => {
    saveState();
    showMenu();
  });
  els.overRetry.addEventListener("click", () => newGame());
  els.overMenu.addEventListener("click", showMenu);
  window.addEventListener("resize", () => {
    if (g) resize();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && g && !g.over) {
      saveState();
      setPaused(true);
    }
  });
  window.addEventListener("pagehide", saveState);

  return { showMenu, debug: () => g };
}
