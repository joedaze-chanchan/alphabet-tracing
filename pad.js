// 쓰기 판: 글자 하나의 윤곽을 보여주고 손가락 따라쓰기를 판정한다. 게임에서 쓴다.
// 연습 화면(app.js)과 같은 판정 엔진(LetterTracer)을 쓰므로 판정 기준이 같다.
//
//   const pad = new TracePad(canvas, { onLetterDone, onStrokeDone, onWrong });
//   pad.setLetter("A");   // null이면 비운다
//   pad.render(now);      // 게임 루프에서 매 프레임 호출

import { LETTERS, STROKE_WIDTH } from "./letters.js";
import { LetterTracer } from "./tracer.js";

const COLORS = {
  outline: "#b9b3a6",
  outlineFill: "#fbfaf6",
  user: "#22c55e",
  wrong: "#ef4444",
  startDot: "#3b82f6",
};
const WRONG_FLASH = 450;

export class TracePad {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.handlers = handlers;
    this.letter = null;
    this.lt = null;
    this.paths = [];
    this.strokeIndex = 0;
    this.liveProgress = 0;
    this.liveColor = COLORS.user;
    this.mode = "empty"; // empty | trace | wrong
    this.pointerId = null;
    this.wrongUntil = 0;
    this.enabled = true;

    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
  }

  setLetter(letter) {
    this.letter = letter;
    this.releasePointer();
    if (!letter) {
      this.lt = null;
      this.paths = [];
      this.mode = "empty";
      return;
    }
    this.lt = new LetterTracer(LETTERS[letter], STROKE_WIDTH);
    this.paths = this.lt.paths;
    this.strokeIndex = 0;
    this.liveProgress = 0;
    this.liveColor = COLORS.user;
    this.mode = "trace";
  }

  clear() {
    this.setLetter(null);
  }

  // ---------- 터치 ----------

  toLetterCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100];
  }

  pointerDown(e) {
    if (!this.enabled || !this.lt || this.pointerId !== null) return;
    if (this.mode === "wrong") this.endWrong(); // 빨간 표시 중에 다시 쓰기 시작하면 바로 받는다
    if (this.mode !== "trace") return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(this.pointerId);
    } catch {
      // 합성 이벤트 등
    }
    const [x, y] = this.toLetterCoords(e);
    const r = this.lt.begin(x, y);
    this.paths = this.lt.paths;
    if (!r.ok) {
      this.releasePointer();
      this.fail(r.reason, 0);
      return;
    }
    this.liveProgress = r.progress;
    this.liveColor = COLORS.user;
  }

  pointerMove(e) {
    if (this.mode !== "trace" || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const [x, y] = this.toLetterCoords(e);
    const r = this.lt.move(x, y);
    this.paths = this.lt.paths;
    this.strokeIndex = this.lt.index;
    if (!r.ok) {
      this.releasePointer();
      this.fail(r.reason, r.progress);
      return;
    }
    this.liveProgress = r.progress;
    if (r.chained && this.handlers.onStrokeDone) this.handlers.onStrokeDone();
  }

  pointerUp(e) {
    if (this.mode !== "trace" || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.releasePointer();
    const r = this.lt.end();
    this.paths = this.lt.paths;
    this.strokeIndex = this.lt.index;
    this.liveProgress = 0;
    if (!r.ok) {
      this.fail(r.reason, r.progress);
      return;
    }
    if (r.strokeDone && this.handlers.onStrokeDone) this.handlers.onStrokeDone();
    if (r.letterDone) {
      const letter = this.letter;
      this.mode = "empty";
      if (this.handlers.onLetterDone) this.handlers.onLetterDone(letter);
      return;
    }
    this.lt.startStroke();
  }

  releasePointer() {
    if (this.pointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.pointerId);
      } catch {
        // 이미 해제됨
      }
    }
    this.pointerId = null;
  }

  fail(reason, progress) {
    this.mode = "wrong";
    this.liveProgress = progress;
    this.liveColor = COLORS.wrong;
    this.wrongUntil = performance.now() + WRONG_FLASH;
    if (this.handlers.onWrong) this.handlers.onWrong(reason);
  }

  // ---------- 그리기 ----------

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(rect.width * dpr);
    if (size > 0 && (this.canvas.width !== size || this.canvas.height !== size)) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
  }

  strokePath(path, t, width, color) {
    const ctx = this.ctx;
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

  // 빨간 표시를 끝내고 같은 획을 다시 받을 준비
  endWrong() {
    this.mode = "trace";
    this.liveProgress = 0;
    this.liveColor = COLORS.user;
    this.lt.startStroke();
    this.paths = this.lt.paths;
    this.strokeIndex = this.lt.index;
  }

  render(now) {
    if (this.mode === "wrong" && now >= this.wrongUntil) this.endWrong();
    const ctx = this.ctx;
    const size = this.canvas.width;
    if (!size) return;
    const k = size / 100;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, 100, 100);
    if (!this.lt) return;

    for (const path of this.paths) this.strokePath(path, 1, STROKE_WIDTH + 3, COLORS.outline);
    for (const path of this.paths) this.strokePath(path, 1, STROKE_WIDTH, COLORS.outlineFill);
    for (let i = 0; i < this.strokeIndex; i++) this.strokePath(this.paths[i], 1, STROKE_WIDTH, COLORS.user);
    if (this.liveProgress > 0 && this.strokeIndex < this.paths.length) {
      this.strokePath(this.paths[this.strokeIndex], this.liveProgress, STROKE_WIDTH, this.liveColor);
    }
    if (this.mode === "trace" && this.pointerId === null && this.strokeIndex < this.paths.length) {
      const p0 = this.paths[this.strokeIndex][0];
      const pulse = 0.5 + 0.5 * Math.sin(now / 250);
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, 4 + pulse * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.startDot;
      ctx.fill();
    }
  }
}
