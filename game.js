// 게임하기: 글자가 붙은 외계 비행선이 내려온다. 비행선을 터치해 고르고, 쓰기 판에 그 스펠링을
// 한 글자씩 따라 쓰면 에너지가 찬다. 다 쓰면 레이저가 발사되어 격추. 바닥에 닿으면 목숨을 잃는다.

import { TracePad } from "./pad.js";
import { DIFFICULTY, DIFFICULTY_ORDER, LIVES, SCORE_PER_LETTER, MEANINGS, PHASES, makeChoices, pickTarget, speedMultiplier } from "./words.js";
import { LETTERS, LETTER_ORDER } from "./letters.js";

const LASER_MS = 380;
const BOOM_MS = 550;
const GROUND_FLASH_MS = 500;

const $ = (id) => document.getElementById(id);

export function setupGame({ onExit, bestStore }) {
  const els = {
    menu: $("game-menu"),
    play: $("game-play"),
    back: $("game-back"),
    diff: $("game-diff"),
    best: $("game-best"),
    start: $("game-start"),
    score: $("game-score"),
    lives: $("game-lives"),
    pause: $("game-pause"),
    sky: $("sky"),
    spell: $("game-spell"),
    pad: $("pad"),
    energy: $("game-energy"),
    write: $("game-write"),
    quiz: $("game-quiz"),
    quizQ: $("quiz-q"),
    quizOpts: $("quiz-opts"),
    msg: $("game-msg"),
    over: $("game-over"),
    overTitle: $("go-title"),
    overScore: $("go-score"),
    overKills: $("go-kills"),
    overBest: $("go-best"),
    overRetry: $("go-retry"),
    overMenu: $("go-menu"),
    paused: $("game-paused"),
    resume: $("go-resume"),
    quit: $("go-quit"),
  };
  const sky = els.sky.getContext("2d");
  // 오래된 브라우저에는 roundRect가 없다
  if (typeof sky.roundRect !== "function") {
    sky.roundRect = function (x, y, w, h, r) {
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
  let g = null; // 진행 중인 게임 상태
  let raf = 0;
  let lastTs = 0;

  const pad = new TracePad(els.pad, {
    onStrokeDone: () => {},
    onLetterDone: () => letterDone(),
    onWrong: () => setMsg("다시 써 보세요. 비행선이 내려와요!", "bad"),
  });

  // ---------- 메뉴 ----------

  function renderMenu() {
    els.diff.innerHTML = "";
    for (const key of DIFFICULTY_ORDER) {
      const d = DIFFICULTY[key];
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
  }

  function showMenu() {
    stopLoop();
    g = null;
    els.play.hidden = true;
    els.menu.hidden = false;
    renderMenu();
  }

  // ---------- 게임 상태 ----------

  function newGame() {
    const d = DIFFICULTY[level];
    g = {
      d,
      ships: [],
      score: 0,
      kills: 0,
      lives: LIVES,
      nextSpawnAt: 0,
      lastWord: null,
      round: null, // { en, ko, isLetter, phase } 같은 단어를 세 번 연달아
      quizLocked: false,
      target: null, // 선택된 비행선
      letterIndex: 0,
      laser: null, // { ship, until }
      booms: [], // { x, y, until }
      groundFlashUntil: 0,
      paused: false,
      over: false,
      elapsed: 0,
      nextId: 1,
      energy: 0,
      aim: -Math.PI / 2, // 포신 각도 (위쪽)
      floats: [], // 떠오르는 점수 글자 { x, y, text, until }
      shakeUntil: 0,
      meteor: null, // 별똥별 { x, y, vx, vy, until }
      nextMeteorAt: 0,
    };
    els.over.hidden = true;
    els.paused.hidden = true;
    els.menu.hidden = true;
    els.play.hidden = false;
    pad.clear();
    showPanel("idle");
    resize();
    renderHud();
    setEnergy(0);
    setSpell();
    setMsg("비행선을 터치해서 고르세요");
    lastTs = 0;
    startLoop();
  }

  // 새 단어(또는 글자) 하나로 3단계 순서를 시작한다
  function newRound() {
    const en = pickTarget(level, g.lastWord);
    g.lastWord = en;
    const isLetter = en.length === 1;
    g.round = { en, ko: isLetter ? LETTERS[en].ko : MEANINGS[en], isLetter, phase: 0 };
  }

  // 4지선다 보기 목록 (정답 + 같은 종류의 오답 3개)
  function choicesFor(round) {
    const pool = round.isLetter
      ? LETTER_ORDER.map((l) => ({ en: l, ko: LETTERS[l].ko }))
      : g.d.words.map((w) => ({ en: w, ko: MEANINGS[w] }));
    return makeChoices({ en: round.en, ko: round.ko }, pool);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.sky.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w > 0 && (els.sky.width !== w || els.sky.height !== h)) {
      els.sky.width = w;
      els.sky.height = h;
      bgCache = null;
    }
    pad.resize();
  }

  function skySize() {
    const dpr = window.devicePixelRatio || 1;
    return { w: els.sky.width / dpr, h: els.sky.height / dpr, dpr };
  }

  function shipRadius() {
    return Math.max(26, Math.min(40, skySize().w * 0.09));
  }

  function spawnShip(now) {
    const { w } = skySize();
    if (!g.round) newRound();
    const round = g.round;
    const phase = PHASES[round.phase];
    const label = phase.key === "english" ? round.ko : round.en; // 3단계는 한글이 내려온다
    const r = shipRadius();
    const margin = r + 8 + label.length * 4;
    g.ships.push({
      id: g.nextId++,
      word: round.en,
      ko: round.ko,
      label,
      phase: round.phase,
      isLetter: round.isLetter,
      x: margin + Math.random() * Math.max(1, w - margin * 2),
      y: -r,
      r,
      wobble: Math.random() * Math.PI * 2,
      state: "alive", // alive | hit
    });
    g.nextSpawnAt = now + g.d.spawnMs;
  }

  function update(now, dt) {
    if (g.paused || g.over) return;
    g.elapsed += dt;
    const { h } = skySize();
    const groundY = h - 14;
    const speed = g.d.speed * h * speedMultiplier(g.kills);

    if (g.ships.filter((s) => s.state === "alive").length < g.d.maxShips && now >= g.nextSpawnAt) spawnShip(now);

    for (const s of g.ships) {
      if (s.state !== "alive") continue;
      s.y += speed * dt;
      s.wobble += dt * 2;
      if (s.y + s.r * 0.5 >= groundY) {
        shipLanded(s, now);
      }
    }
    if (g.laser && now >= g.laser.until) {
      const s = g.laser.ship;
      g.booms.push({ x: s.x, y: s.y, until: now + BOOM_MS, seed: Math.random() * 1000 });
      g.floats.push({ x: s.x, y: s.y - 20, text: `+${s.word.length * SCORE_PER_LETTER}`, until: now + 1100 });
      g.shakeUntil = now + 320;
      g.ships = g.ships.filter((o) => o !== s);
      g.laser = null;
    }
    g.booms = g.booms.filter((b) => now < b.until);
    g.floats = g.floats.filter((f) => now < f.until);

    // 포신은 목표(또는 발사 중인 비행선)를 향해 부드럽게 돈다
    const { w } = skySize();
    const aimShip = (g.laser && g.laser.ship) || g.target;
    const want = aimShip ? Math.atan2(aimShip.y - (groundY - 26), aimShip.x - w / 2) : -Math.PI / 2;
    let diff = want - g.aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    g.aim += diff * Math.min(1, dt * 10);

    // 별똥별
    if (!g.meteor && now >= g.nextMeteorAt) {
      g.meteor = { x: Math.random() * w * 0.8, y: Math.random() * h * 0.3, vx: 420 + Math.random() * 200, vy: 180 + Math.random() * 120, until: now + 700 };
      g.nextMeteorAt = now + 4000 + Math.random() * 5000;
    }
    if (g.meteor) {
      g.meteor.x += g.meteor.vx * dt;
      g.meteor.y += g.meteor.vy * dt;
      if (now >= g.meteor.until) g.meteor = null;
    }
  }

  function shipLanded(s, now) {
    g.ships = g.ships.filter((o) => o !== s);
    g.lives -= 1;
    g.groundFlashUntil = now + GROUND_FLASH_MS;
    g.nextSpawnAt = now + g.d.spawnMs; // 같은 단어·같은 단계가 다시 내려온다
    if (g.target === s) {
      g.target = null;
      pad.clear();
      showPanel("idle");
      setSpell();
      setEnergy(0);
    }
    renderHud();
    if (g.lives <= 0) {
      gameOver();
    } else {
      setMsg("비행선이 착륙했어요! 목숨 하나를 잃었어요", "bad");
    }
  }

  function selectShip(s) {
    if (g.laser && g.laser.ship === s) return;
    if (g.target === s) return;
    g.target = s;
    g.letterIndex = 0;
    setEnergy(0);
    const phase = PHASES[s.phase].key;
    if (phase === "write") {
      showPanel("write");
      setSpell();
      pad.setLetter(s.word[0]);
      setMsg(s.word.length === 1 ? `${s.word} 글자를 써서 격추하세요` : `${s.word} 스펠링을 한 글자씩 써서 격추하세요`);
    } else {
      pad.clear();
      setSpell();
      showQuiz(s, phase);
    }
  }

  // 4지선다: meaning = 영어 보고 한글 고르기, english = 한글 보고 영어 고르기
  function showQuiz(s, phase) {
    showPanel("quiz");
    g.quizLocked = false;
    const round = { en: s.word, ko: s.ko, isLetter: s.isLetter };
    const choices = choicesFor(round);
    if (phase === "meaning") {
      els.quizQ.innerHTML = s.isLetter
        ? `<span class="en">${s.word}</span> 어떻게 읽을까요?`
        : `<span class="en">${s.word}</span> 뜻은?`;
    } else {
      els.quizQ.innerHTML = s.isLetter ? `'${s.ko}' 어느 글자일까요?` : `'${s.ko}' 영어로는?`;
    }
    els.quizOpts.innerHTML = "";
    for (const c of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-opt";
      b.textContent = phase === "meaning" ? c.ko : c.en;
      b.addEventListener("click", () => answerQuiz(s, c.en === s.word, b));
      els.quizOpts.appendChild(b);
    }
    setMsg("맞는 답을 고르면 레이저가 발사돼요");
  }

  function answerQuiz(s, correct, btn) {
    if (g.quizLocked || g.target !== s || s.state !== "alive") return;
    if (!correct) {
      btn.classList.add("wrong");
      btn.disabled = true;
      setMsg("아니에요. 다시 골라 보세요!", "bad");
      return;
    }
    g.quizLocked = true;
    btn.classList.add("right");
    for (const el of els.quizOpts.children) el.disabled = true;
    setEnergy(1);
    setTimeout(() => {
      if (g && g.target === s && s.state === "alive") fire(s);
    }, 350);
  }

  // 아래 제어판: idle(안내만) | write(쓰기 판) | quiz(4지선다)
  function showPanel(kind) {
    els.write.hidden = kind === "quiz";
    els.quiz.hidden = kind !== "quiz";
    if (kind !== "quiz") els.quizOpts.innerHTML = "";
  }

  function letterDone() {
    const s = g.target;
    if (!s) return;
    g.letterIndex += 1;
    setEnergy(g.letterIndex / s.word.length);
    if (g.letterIndex >= s.word.length) {
      fire(s);
      return;
    }
    setSpell();
    pad.setLetter(s.word[g.letterIndex]);
    setMsg("좋아요! 다음 글자");
  }

  function fire(s) {
    const now = performance.now();
    s.state = "hit";
    g.laser = { ship: s, until: now + LASER_MS };
    g.score += s.word.length * SCORE_PER_LETTER;
    g.kills += 1;
    g.target = null;
    pad.clear();
    setSpell();
    renderHud();
    // 같은 단어의 다음 단계로. 세 단계를 다 마치면 새 단어.
    if (g.round && g.round.phase < PHASES.length - 1) g.round.phase += 1;
    else g.round = null;
    g.nextSpawnAt = now + LASER_MS + g.d.spawnMs;
    setMsg(`발사! +${s.word.length * SCORE_PER_LETTER}점`, "ok");
    setTimeout(() => {
      if (g && !g.over && !g.target) showPanel("idle");
    }, LASER_MS);
    setTimeout(() => {
      if (g && !g.over) setEnergy(0);
    }, LASER_MS);
  }

  function gameOver() {
    g.over = true;
    pad.clear();
    const best = bestStore.update(level, g.score);
    els.overTitle.textContent = g.score >= best && g.score > 0 ? "최고 기록!" : "게임 끝";
    els.overScore.textContent = `${g.score}점`;
    els.overKills.textContent = `격추 ${g.kills}대`;
    els.overBest.textContent = `최고 점수 ${best}점`;
    els.over.hidden = false;
  }

  // ---------- 화면 요소 ----------

  function renderHud() {
    els.score.textContent = `${g.score}점`;
    els.lives.textContent = "♥".repeat(g.lives) + "♡".repeat(Math.max(0, LIVES - g.lives));
  }

  function setEnergy(frac) {
    if (g) g.energy = Math.max(0, Math.min(1, frac));
    els.energy.style.height = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    els.energy.classList.toggle("full", frac >= 1);
  }

  function setSpell() {
    if (!g || !g.target) {
      els.spell.innerHTML = "";
      return;
    }
    els.spell.innerHTML = g.target.word
      .split("")
      .map((ch, i) => `<span class="${i < g.letterIndex ? "written" : i === g.letterIndex ? "cur" : ""}">${ch}</span>`)
      .join("");
  }

  function setMsg(text, kind = "") {
    els.msg.textContent = text;
    els.msg.className = "game-msg " + kind;
  }

  // ---------- 하늘 그리기 ----------

  let bgCache = null; // 움직이지 않는 배경(우주, 행성, 별, 땅)은 한 번만 그려 둔다

  function buildBackground() {
    const { w, h, dpr } = skySize();
    const c = document.createElement("canvas");
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const x = c.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 깊은 우주
    const grad = x.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#050a1f");
    grad.addColorStop(0.55, "#0e1b4a");
    grad.addColorStop(1, "#23336f");
    x.fillStyle = grad;
    x.fillRect(0, 0, w, h);

    // 성운 (보라·청록 빛)
    const nebula = (cx, cy, r, color) => {
      const g2 = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g2.addColorStop(0, color);
      g2.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g2;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    nebula(w * 0.2, h * 0.35, w * 0.5, "rgba(168,85,247,0.22)");
    nebula(w * 0.85, h * 0.6, w * 0.45, "rgba(34,211,238,0.16)");
    nebula(w * 0.6, h * 0.15, w * 0.35, "rgba(244,114,182,0.14)");

    // 별 (크기 다양)
    for (let i = 0; i < 120; i++) {
      const sx = ((i * 97 + 13) % 1000) / 1000 * w;
      const sy = ((i * 53 + 7) % 1000) / 1000 * (h - 40);
      const sr = i % 9 === 0 ? 1.8 : i % 4 === 0 ? 1.2 : 0.7;
      x.globalAlpha = 0.35 + ((i * 37) % 60) / 100;
      x.fillStyle = i % 7 === 0 ? "#bae6fd" : i % 11 === 0 ? "#fde68a" : "#ffffff";
      x.beginPath();
      x.arc(sx, sy, sr, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;

    // 고리 행성 (오른쪽 위)
    const px = w * 0.8;
    const py = h * 0.16;
    const pr = Math.min(w, h) * 0.09;
    x.save();
    x.translate(px, py);
    x.rotate(-0.35);
    x.strokeStyle = "rgba(253,224,71,0.55)";
    x.lineWidth = pr * 0.22;
    x.beginPath();
    x.ellipse(0, 0, pr * 1.9, pr * 0.55, 0, Math.PI * 0.05, Math.PI * 0.95);
    x.stroke();
    x.restore();
    const pg = x.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, "#fdba74");
    pg.addColorStop(0.6, "#f97316");
    pg.addColorStop(1, "#7c2d12");
    x.fillStyle = pg;
    x.beginPath();
    x.arc(px, py, pr, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "rgba(124,45,18,0.35)";
    x.beginPath();
    x.ellipse(px, py + pr * 0.2, pr * 0.9, pr * 0.14, 0, 0, Math.PI * 2);
    x.fill();
    x.save();
    x.translate(px, py);
    x.rotate(-0.35);
    x.strokeStyle = "rgba(253,224,71,0.9)";
    x.lineWidth = pr * 0.22;
    x.beginPath();
    x.ellipse(0, 0, pr * 1.9, pr * 0.55, 0, Math.PI * 1.05, Math.PI * 1.95);
    x.stroke();
    x.restore();

    // 달 (왼쪽 위, 작게)
    const mx = w * 0.12;
    const my = h * 0.1;
    const mr = Math.min(w, h) * 0.04;
    x.fillStyle = "#e5e7eb";
    x.beginPath();
    x.arc(mx, my, mr, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#cbd5e1";
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.3, -0.35, 0.12]]) {
      x.beginPath();
      x.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2);
      x.fill();
    }

    // 먼 도시 실루엣과 땅
    const groundY = h - 14;
    x.fillStyle = "#0b1a2a";
    let bx = 0;
    let k = 0;
    while (bx < w) {
      const bw = 14 + ((k * 31) % 22);
      const bh = 18 + ((k * 47) % 46);
      x.fillRect(bx, groundY - bh, bw, bh);
      x.fillStyle = "#fde68a";
      for (let wy = groundY - bh + 5; wy < groundY - 4; wy += 8) {
        for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) {
          if ((k * 7 + wx + wy) % 5 === 0) x.fillRect(wx, wy, 2, 3);
        }
      }
      x.fillStyle = "#0b1a2a";
      bx += bw + 3;
      k++;
    }
    const gg = x.createLinearGradient(0, groundY, 0, h);
    gg.addColorStop(0, "#3f8f3a");
    gg.addColorStop(1, "#1f4d1e");
    x.fillStyle = gg;
    x.fillRect(0, groundY, w, 14);
    x.fillStyle = "rgba(190,242,100,0.8)";
    x.fillRect(0, groundY, w, 2);
    return c;
  }

  function drawSky(now) {
    const { w, h, dpr } = skySize();
    if (!bgCache) bgCache = buildBackground();
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 흔들림
    if (now < g.shakeUntil) {
      const k = (g.shakeUntil - now) / 320;
      sky.translate((Math.random() - 0.5) * 10 * k, (Math.random() - 0.5) * 10 * k);
    }
    sky.drawImage(bgCache, 0, 0, w, h);

    // 반짝이는 별 몇 개
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 173 + 41) % 1000) / 1000 * w;
      const sy = ((i * 89 + 23) % 1000) / 1000 * (h - 60);
      const tw = 0.5 + 0.5 * Math.sin(now / 350 + i * 1.7);
      sky.globalAlpha = 0.25 + 0.75 * tw;
      sky.fillStyle = "#ffffff";
      sky.beginPath();
      sky.arc(sx, sy, 1 + tw * 1.4, 0, Math.PI * 2);
      sky.fill();
    }
    sky.globalAlpha = 1;

    // 별똥별
    if (g.meteor) {
      const m = g.meteor;
      const t = 1 - (m.until - now) / 700;
      sky.save();
      sky.globalAlpha = 1 - t;
      const tail = sky.createLinearGradient(m.x - m.vx * 0.12, m.y - m.vy * 0.12, m.x, m.y);
      tail.addColorStop(0, "rgba(255,255,255,0)");
      tail.addColorStop(1, "#ffffff");
      sky.strokeStyle = tail;
      sky.lineWidth = 2.5;
      sky.lineCap = "round";
      sky.beginPath();
      sky.moveTo(m.x - m.vx * 0.12, m.y - m.vy * 0.12);
      sky.lineTo(m.x, m.y);
      sky.stroke();
      sky.restore();
    }

    const groundY = h - 14;
    if (now < g.groundFlashUntil) {
      sky.fillStyle = `rgba(239,68,68,${0.6 * ((g.groundFlashUntil - now) / GROUND_FLASH_MS)})`;
      sky.fillRect(0, groundY - 60, w, 74);
    }

    for (const s of g.ships) drawShip(s, now);
    drawTurret(w / 2, groundY, now);
    if (g.laser) drawLaser(w / 2, groundY - 26, g.laser.ship, now);
    for (const b of g.booms) drawBoom(b, now);
    for (const f of g.floats) drawFloat(f, now);
  }

  // 레이저 발사대: 받침대 + 회전 포신 + 에너지 발광
  function drawTurret(x, y, now) {
    // 받침대
    const base = sky.createLinearGradient(x - 34, y - 14, x + 34, y);
    base.addColorStop(0, "#64748b");
    base.addColorStop(0.5, "#e2e8f0");
    base.addColorStop(1, "#475569");
    sky.fillStyle = base;
    sky.beginPath();
    sky.roundRect(x - 34, y - 14, 68, 14, 7);
    sky.fill();
    sky.fillStyle = "#1e293b";
    sky.beginPath();
    sky.roundRect(x - 22, y - 20, 44, 8, 4);
    sky.fill();
    // 회전대
    const dome = sky.createRadialGradient(x - 4, y - 30, 2, x, y - 26, 16);
    dome.addColorStop(0, "#cbd5e1");
    dome.addColorStop(1, "#334155");
    sky.fillStyle = dome;
    sky.beginPath();
    sky.arc(x, y - 26, 15, 0, Math.PI * 2);
    sky.fill();
    // 포신 (목표 방향으로 회전)
    const glow = g.energy;
    sky.save();
    sky.translate(x, y - 26);
    sky.rotate(g.aim);
    const barrel = sky.createLinearGradient(0, -6, 0, 6);
    barrel.addColorStop(0, "#94a3b8");
    barrel.addColorStop(0.5, "#f1f5f9");
    barrel.addColorStop(1, "#475569");
    sky.fillStyle = barrel;
    sky.beginPath();
    sky.roundRect(0, -6, 34, 12, 4);
    sky.fill();
    sky.fillStyle = "#1e293b";
    sky.fillRect(24, -7, 4, 14);
    // 포구 발광: 에너지가 찰수록 밝아진다
    if (glow > 0) {
      const gl = sky.createRadialGradient(34, 0, 0, 34, 0, 12 + glow * 10);
      gl.addColorStop(0, `rgba(253,224,71,${0.9 * glow})`);
      gl.addColorStop(1, "rgba(253,224,71,0)");
      sky.fillStyle = gl;
      sky.beginPath();
      sky.arc(34, 0, 12 + glow * 10, 0, Math.PI * 2);
      sky.fill();
    }
    sky.restore();
    // 에너지 표시등
    for (let i = 0; i < 3; i++) {
      const on = glow >= (i + 1) / 3 - 0.001;
      sky.fillStyle = on ? "#facc15" : "#334155";
      sky.beginPath();
      sky.arc(x - 12 + i * 12, y - 16, 2.5, 0, Math.PI * 2);
      sky.fill();
    }
  }

  function drawLaser(x0, y0, s, now) {
    const t = 1 - (g.laser.until - now) / LASER_MS;
    const mx = x0 + Math.cos(g.aim) * 34;
    const my = y0 + Math.sin(g.aim) * 34;
    sky.save();
    sky.lineCap = "round";
    // 바깥 광채
    sky.strokeStyle = `rgba(56,189,248,${0.35 * (1 - t)})`;
    sky.lineWidth = 26;
    sky.beginPath();
    sky.moveTo(mx, my);
    sky.lineTo(s.x, s.y);
    sky.stroke();
    // 본체
    sky.strokeStyle = "#f43f5e";
    sky.lineWidth = 11 * (1 - t * 0.5);
    sky.shadowColor = "#fb7185";
    sky.shadowBlur = 20;
    sky.stroke();
    // 심지
    sky.shadowBlur = 0;
    sky.strokeStyle = "#fff7ae";
    sky.lineWidth = 4;
    sky.stroke();
    // 빔을 따라 흐르는 불꽃
    const len = Math.hypot(s.x - mx, s.y - my);
    for (let i = 0; i < 8; i++) {
      const u = ((now / 90 + i * 13) % 100) / 100;
      const px = mx + (s.x - mx) * u + Math.sin(now / 40 + i) * 5;
      const py = my + (s.y - my) * u + Math.cos(now / 40 + i) * 5;
      sky.fillStyle = i % 2 ? "#fde68a" : "#ffffff";
      sky.beginPath();
      sky.arc(px, py, 2.2, 0, Math.PI * 2);
      sky.fill();
    }
    // 포구 섬광
    const fl = sky.createRadialGradient(mx, my, 0, mx, my, 22);
    fl.addColorStop(0, "rgba(255,255,255,0.95)");
    fl.addColorStop(0.4, "rgba(253,224,71,0.7)");
    fl.addColorStop(1, "rgba(253,224,71,0)");
    sky.fillStyle = fl;
    sky.beginPath();
    sky.arc(mx, my, 22, 0, Math.PI * 2);
    sky.fill();
    // 맞은 자리 섬광
    sky.fillStyle = `rgba(255,255,255,${0.8 * t})`;
    sky.beginPath();
    sky.arc(s.x, s.y, 10 + t * 20, 0, Math.PI * 2);
    sky.fill();
    sky.restore();
    void len;
  }

  // 외계 비행선: 금속 접시 + 돌아가는 불빛 + 유리 돔 속 외계인
  function drawShip(s, now) {
    const { x, r } = s;
    const y = s.y + Math.sin(s.wobble) * 3;
    const sel = g.target === s;
    const hit = s.state === "hit";
    sky.save();

    // 선택 표시: 돌아가는 조준 고리
    if (sel) {
      sky.save();
      sky.translate(x, y);
      sky.rotate(now / 600);
      sky.strokeStyle = "#fbbf24";
      sky.lineWidth = 3;
      sky.setLineDash([10, 8]);
      sky.beginPath();
      sky.arc(0, 0, r + 12 + Math.sin(now / 200) * 2, 0, Math.PI * 2);
      sky.stroke();
      sky.restore();
    }

    // 아래로 퍼지는 빛 (견인 광선)
    const beam = sky.createLinearGradient(x, y, x, y + r * 1.4);
    beam.addColorStop(0, sel ? "rgba(251,191,36,0.35)" : "rgba(103,232,249,0.22)");
    beam.addColorStop(1, "rgba(103,232,249,0)");
    sky.fillStyle = beam;
    sky.beginPath();
    sky.moveTo(x - r * 0.5, y);
    sky.lineTo(x + r * 0.5, y);
    sky.lineTo(x + r * 0.9, y + r * 1.4);
    sky.lineTo(x - r * 0.9, y + r * 1.4);
    sky.closePath();
    sky.fill();

    // 접시 (금속)
    const body = sky.createLinearGradient(x, y - r * 0.4, x, y + r * 0.45);
    body.addColorStop(0, hit ? "#fecaca" : "#f8fafc");
    body.addColorStop(0.5, hit ? "#f87171" : sel ? "#fbbf24" : "#94a3b8");
    body.addColorStop(1, hit ? "#7f1d1d" : sel ? "#b45309" : "#334155");
    sky.fillStyle = body;
    sky.shadowColor = sel ? "#fbbf24" : "#67e8f9";
    sky.shadowBlur = sel ? 22 : 10;
    sky.beginPath();
    sky.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
    sky.fill();
    sky.shadowBlur = 0;
    // 접시 가장자리 불빛 (색이 돌아감)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + now / 500;
      const lx = x + Math.cos(a) * r * 0.8;
      const ly = y + Math.sin(a) * r * 0.3 + r * 0.08;
      const hue = (now / 8 + i * 50) % 360;
      sky.fillStyle = `hsl(${hue} 100% 65%)`;
      sky.beginPath();
      sky.arc(lx, ly, 3.2, 0, Math.PI * 2);
      sky.fill();
    }
    // 유리 돔
    const glass = sky.createRadialGradient(x - r * 0.15, y - r * 0.55, 2, x, y - r * 0.3, r * 0.55);
    glass.addColorStop(0, "rgba(224,242,254,0.95)");
    glass.addColorStop(1, "rgba(56,189,248,0.45)");
    sky.fillStyle = glass;
    sky.beginPath();
    sky.ellipse(x, y - r * 0.28, r * 0.52, r * 0.5, 0, Math.PI, 0);
    sky.fill();
    // 외계인
    sky.fillStyle = "#4ade80";
    sky.beginPath();
    sky.ellipse(x, y - r * 0.42, r * 0.2, r * 0.24, 0, 0, Math.PI * 2);
    sky.fill();
    sky.fillStyle = "#0f172a";
    for (const dx of [-0.08, 0.08]) {
      sky.beginPath();
      sky.ellipse(x + dx * r, y - r * 0.46, r * 0.055, r * 0.08, 0, 0, Math.PI * 2);
      sky.fill();
    }
    sky.strokeStyle = "#4ade80";
    sky.lineWidth = 1.5;
    sky.beginPath();
    sky.moveTo(x, y - r * 0.66);
    sky.lineTo(x, y - r * 0.8);
    sky.stroke();
    sky.fillStyle = "#f472b6";
    sky.beginPath();
    sky.arc(x, y - r * 0.82, 2, 0, Math.PI * 2);
    sky.fill();

    // 글자 표시 (스티커처럼). 3단계는 한글.
    const label = s.label;
    sky.font = `800 ${label.length > 3 ? 15 : 18}px "Helvetica Neue", Arial, "Noto Sans KR", "Malgun Gothic", sans-serif`;
    const tw = sky.measureText(label).width + 18;
    sky.fillStyle = sel ? "#f59e0b" : "#0f172a";
    sky.strokeStyle = sel ? "#fde68a" : "#67e8f9";
    sky.lineWidth = 2;
    sky.beginPath();
    sky.roundRect(x - tw / 2, y + r * 0.5, tw, 24, 10);
    sky.fill();
    sky.stroke();
    sky.fillStyle = "#ffffff";
    sky.textAlign = "center";
    sky.textBaseline = "middle";
    sky.fillText(label, x, y + r * 0.5 + 12);
    // 단계 표시 (①②③): 1 뜻, 2 쓰기, 3 영어
    const icons = ["?", "✎", "?"];
    sky.fillStyle = ["#a855f7", "#22c55e", "#f97316"][s.phase];
    sky.beginPath();
    sky.arc(x + tw / 2 + 4, y + r * 0.5 + 2, 10, 0, Math.PI * 2);
    sky.fill();
    sky.fillStyle = "#ffffff";
    sky.font = '800 12px "Helvetica Neue", Arial, sans-serif';
    sky.fillText(`${s.phase + 1}`, x + tw / 2 + 4, y + r * 0.5 + 2);
    void icons;
    sky.restore();
  }

  // 폭발: 섬광 + 충격파 고리 + 사방으로 튀는 불꽃
  function drawBoom(b, now) {
    const t = 1 - (b.until - now) / BOOM_MS;
    sky.save();
    // 섬광
    if (t < 0.25) {
      sky.globalAlpha = 1 - t * 4;
      sky.fillStyle = "#ffffff";
      sky.beginPath();
      sky.arc(b.x, b.y, 30 + t * 60, 0, Math.PI * 2);
      sky.fill();
    }
    // 충격파
    sky.globalAlpha = 1 - t;
    sky.strokeStyle = "#fde68a";
    sky.lineWidth = 4 * (1 - t) + 1;
    sky.beginPath();
    sky.arc(b.x, b.y, 8 + t * 70, 0, Math.PI * 2);
    sky.stroke();
    // 불꽃 조각
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + b.seed;
      const speed = 45 + ((i * 37 + b.seed) % 40);
      const d = t * speed;
      const px = b.x + Math.cos(a) * d;
      const py = b.y + Math.sin(a) * d + t * t * 40;
      sky.fillStyle = i % 3 === 0 ? "#fbbf24" : i % 3 === 1 ? "#f87171" : "#fb923c";
      sky.beginPath();
      sky.arc(px, py, 5 * (1 - t) + 1, 0, Math.PI * 2);
      sky.fill();
    }
    sky.restore();
  }

  function drawFloat(f, now) {
    const t = 1 - (f.until - now) / 1100;
    sky.save();
    sky.globalAlpha = 1 - t;
    sky.font = '900 24px "Helvetica Neue", Arial, sans-serif';
    sky.textAlign = "center";
    sky.textBaseline = "middle";
    sky.lineWidth = 4;
    sky.strokeStyle = "#7c2d12";
    sky.fillStyle = "#fde68a";
    sky.strokeText(f.text, f.x, f.y - t * 40);
    sky.fillText(f.text, f.x, f.y - t * 40);
    sky.restore();
  }

  // ---------- 루프 ----------

  function frame(ts) {
    if (!g) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    try {
      update(ts, dt);
      drawSky(ts);
      pad.render(ts);
    } catch (err) {
      // 한 프레임의 오류로 게임이 멈추지 않게 한다. 메시지 줄에 표시해 원인을 알 수 있게.
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
    pad.enabled = !p;
    els.paused.hidden = !p;
    lastTs = 0;
  }

  // ---------- 이벤트 ----------

  els.sky.addEventListener("pointerdown", (e) => {
    if (!g || g.paused || g.over) return;
    e.preventDefault();
    const rect = els.sky.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    for (const s of g.ships) {
      if (s.state !== "alive") continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < s.r + 18 && (!best || d < best.d)) best = { s, d };
    }
    if (best) selectShip(best.s);
  });
  els.back.addEventListener("click", () => {
    stopLoop();
    g = null;
    onExit();
  });
  els.start.addEventListener("click", newGame);
  els.pause.addEventListener("click", () => setPaused(true));
  els.resume.addEventListener("click", () => setPaused(false));
  els.quit.addEventListener("click", showMenu);
  els.overRetry.addEventListener("click", newGame);
  els.overMenu.addEventListener("click", showMenu);
  window.addEventListener("resize", () => {
    if (g) resize();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && g && !g.over) setPaused(true);
  });

  return { showMenu };
}
