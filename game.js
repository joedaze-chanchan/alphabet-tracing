// 게임하기: 글자가 붙은 외계 비행선이 내려온다. 비행선을 터치해 고르고, 쓰기 판에 그 스펠링을
// 한 글자씩 따라 쓰면 에너지가 찬다. 다 쓰면 레이저가 발사되어 격추. 바닥에 닿으면 목숨을 잃는다.

import { TracePad } from "./pad.js";
import { DIFFICULTY, DIFFICULTY_ORDER, LIVES, SCORE_PER_LETTER, pickTarget, speedMultiplier } from "./words.js";

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
      target: null, // 선택된 비행선
      letterIndex: 0,
      laser: null, // { ship, until }
      booms: [], // { x, y, until }
      groundFlashUntil: 0,
      paused: false,
      over: false,
      elapsed: 0,
      nextId: 1,
    };
    els.over.hidden = true;
    els.paused.hidden = true;
    els.menu.hidden = true;
    els.play.hidden = false;
    pad.clear();
    resize();
    renderHud();
    setEnergy(0);
    setSpell();
    setMsg("비행선을 터치해서 고르세요");
    lastTs = 0;
    startLoop();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.sky.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w > 0 && (els.sky.width !== w || els.sky.height !== h)) {
      els.sky.width = w;
      els.sky.height = h;
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
    const word = pickTarget(level, g.lastWord);
    g.lastWord = word;
    const r = shipRadius();
    const margin = r + 8 + word.length * 4;
    g.ships.push({
      id: g.nextId++,
      word,
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
      g.booms.push({ x: s.x, y: s.y, until: now + BOOM_MS });
      g.ships = g.ships.filter((o) => o !== s);
      g.laser = null;
    }
    g.booms = g.booms.filter((b) => now < b.until);
  }

  function shipLanded(s, now) {
    g.ships = g.ships.filter((o) => o !== s);
    g.lives -= 1;
    g.groundFlashUntil = now + GROUND_FLASH_MS;
    if (g.target === s) {
      g.target = null;
      pad.clear();
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
    setSpell();
    pad.setLetter(s.word[0]);
    setMsg(s.word.length === 1 ? `${s.word}를 써서 격추하세요` : `${s.word}를 한 글자씩 써서 격추하세요`);
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
    setMsg(`발사! +${s.word.length * SCORE_PER_LETTER}점`, "ok");
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
      .map((ch, i) => `<span class="${i < g.letterIndex ? "done" : i === g.letterIndex ? "cur" : ""}">${ch}</span>`)
      .join("");
  }

  function setMsg(text, kind = "") {
    els.msg.textContent = text;
    els.msg.className = "game-msg " + kind;
  }

  // ---------- 하늘 그리기 ----------

  function drawSky(now) {
    const { w, h, dpr } = skySize();
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 배경
    const grad = sky.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0b1a3a");
    grad.addColorStop(1, "#1d3a6e");
    sky.fillStyle = grad;
    sky.fillRect(0, 0, w, h);
    // 별
    sky.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97) % 100) / 100 * w;
      const y = ((i * 53) % 100) / 100 * (h - 30);
      const tw = 0.5 + 0.5 * Math.sin(now / 700 + i);
      sky.globalAlpha = 0.3 + 0.6 * tw;
      sky.fillRect(x, y, 2, 2);
    }
    sky.globalAlpha = 1;
    // 땅
    const groundY = h - 14;
    sky.fillStyle = now < g.groundFlashUntil ? "#ef4444" : "#3b6d3a";
    sky.fillRect(0, groundY, w, 14);
    // 발사대
    drawTurret(w / 2, groundY);
    // 레이저
    if (g.laser) drawLaser(w / 2, groundY - 22, g.laser.ship, now);
    // 비행선
    for (const s of g.ships) drawShip(s, now);
    // 폭발
    for (const b of g.booms) drawBoom(b, now);
  }

  function drawTurret(x, y) {
    sky.fillStyle = "#94a3b8";
    sky.beginPath();
    sky.roundRect(x - 22, y - 16, 44, 16, 6);
    sky.fill();
    sky.fillStyle = "#e2e8f0";
    sky.beginPath();
    sky.roundRect(x - 5, y - 30, 10, 18, 3);
    sky.fill();
  }

  function drawLaser(x0, y0, s, now) {
    const t = 1 - (g.laser.until - now) / LASER_MS;
    sky.save();
    sky.lineCap = "round";
    sky.strokeStyle = "rgba(255,80,80,0.9)";
    sky.lineWidth = 10 * (1 - t * 0.6);
    sky.shadowColor = "#ff4d4d";
    sky.shadowBlur = 16;
    sky.beginPath();
    sky.moveTo(x0, y0);
    sky.lineTo(s.x, s.y);
    sky.stroke();
    sky.strokeStyle = "#fff5b8";
    sky.lineWidth = 3;
    sky.shadowBlur = 0;
    sky.stroke();
    sky.restore();
  }

  function drawShip(s, now) {
    const { x, r } = s;
    const y = s.y + Math.sin(s.wobble) * 3;
    const sel = g.target === s;
    sky.save();
    if (sel) {
      sky.shadowColor = "#fbbf24";
      sky.shadowBlur = 18;
    }
    // 접시
    sky.fillStyle = sel ? "#fbbf24" : "#cbd5e1";
    sky.beginPath();
    sky.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
    sky.fill();
    sky.shadowBlur = 0;
    // 돔
    sky.fillStyle = s.state === "hit" ? "#fecaca" : "#bae6fd";
    sky.beginPath();
    sky.ellipse(x, y - r * 0.3, r * 0.5, r * 0.45, 0, Math.PI, 0);
    sky.fill();
    // 불빛
    sky.fillStyle = "#f472b6";
    for (let i = -1; i <= 1; i++) {
      sky.beginPath();
      sky.arc(x + i * r * 0.5, y + r * 0.12, 3, 0, Math.PI * 2);
      sky.fill();
    }
    // 글자 표시
    const label = s.word;
    sky.font = `700 ${label.length > 3 ? 15 : 18}px "Helvetica Neue", Arial, sans-serif`;
    const tw = sky.measureText(label).width + 16;
    sky.fillStyle = sel ? "#92400e" : "#0f172a";
    sky.beginPath();
    sky.roundRect(x - tw / 2, y + r * 0.5, tw, 24, 8);
    sky.fill();
    sky.fillStyle = "#ffffff";
    sky.textAlign = "center";
    sky.textBaseline = "middle";
    sky.fillText(label, x, y + r * 0.5 + 12);
    sky.restore();
  }

  function drawBoom(b, now) {
    const t = 1 - (b.until - now) / BOOM_MS;
    sky.save();
    sky.globalAlpha = 1 - t;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = 10 + t * 40;
      sky.fillStyle = i % 2 ? "#fbbf24" : "#f87171";
      sky.beginPath();
      sky.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 5 * (1 - t) + 1, 0, Math.PI * 2);
      sky.fill();
    }
    sky.restore();
  }

  // ---------- 루프 ----------

  function frame(ts) {
    if (!g) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    update(ts, dt);
    drawSky(ts);
    pad.render(ts);
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
