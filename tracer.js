// 획 판정 엔진. 화면과 무관한 순수 로직.
//
// 사용법:
//   const path = buildPath(points);              // 획 중심선을 재표본
//   const t = new StrokeTracer(path, width);     // 획 하나를 판정
//   t.begin(x, y)  -> { ok, reason? }
//   t.move(x, y)   -> { ok, reason?, progress }
//   t.end()        -> { ok, reason?, progress }

export const START_ZONE = 0.15; // 시작점으로 인정하는 진행도 범위
export const FINISH_ZONE = 0.85; // 정답으로 인정하는 최소 진행도
export const WINDOW_BACK = 0.1; // 이동 중 뒤로 허용하는 진행도
export const WINDOW_AHEAD = 0.3; // 이동 중 앞으로 허용하는 진행도
export const RADIUS_MARGIN = 6; // 획 굵기 절반에 더하는 여유

// 중심선을 일정 간격(step)으로 재표본해 { x, y, t } 점 목록을 만든다.
export function buildPath(points, step = 1) {
  if (!points || points.length < 2) throw new Error("획은 점이 2개 이상이어야 합니다");
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  }
  const total = cum[cum.length - 1];
  const out = [];
  let seg = 0;
  const n = Math.max(2, Math.ceil(total / step) + 1);
  for (let i = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
    while (seg < points.length - 2 && cum[seg + 1] < d) seg++;
    const a = points[seg];
    const b = points[seg + 1];
    const len = cum[seg + 1] - cum[seg];
    const u = len === 0 ? 0 : (d - cum[seg]) / len;
    out.push({ x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, t: d / total });
  }
  return out;
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// path 안에서 (x,y)에 가장 가까운 점을 찾는다. tMin~tMax 창으로 제한할 수 있다.
export function nearest(path, x, y, tMin = 0, tMax = 1) {
  let best = null;
  for (const p of path) {
    if (p.t < tMin || p.t > tMax) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (!best || d < best.d) best = { d, t: p.t, x: p.x, y: p.y };
  }
  return best;
}

export class StrokeTracer {
  constructor(path, strokeWidth) {
    this.path = path;
    this.radius = strokeWidth / 2 + RADIUS_MARGIN;
    this.progress = 0;
    this.active = false;
  }

  begin(x, y) {
    const n = nearest(this.path, x, y);
    if (!n || n.d > this.radius || n.t > START_ZONE) {
      this.active = false;
      return { ok: false, reason: "start", progress: 0 };
    }
    this.active = true;
    this.progress = n.t;
    return { ok: true, progress: this.progress };
  }

  move(x, y) {
    if (!this.active) return { ok: false, reason: "inactive", progress: this.progress };
    const n = nearest(this.path, x, y, this.progress - WINDOW_BACK, this.progress + WINDOW_AHEAD);
    if (!n || n.d > this.radius) {
      this.active = false;
      return { ok: false, reason: "off", progress: this.progress };
    }
    this.progress = Math.max(this.progress, n.t);
    return { ok: true, progress: this.progress };
  }

  end() {
    if (!this.active) return { ok: false, reason: "inactive", progress: this.progress };
    this.active = false;
    if (this.progress >= FINISH_ZONE) return { ok: true, progress: this.progress };
    return { ok: false, reason: "short", progress: this.progress };
  }
}

// ---------- 글자 단위 판정 (획 순서 + 이어 쓰기) ----------

export const CHAIN_MIN_PROGRESS = 0.2; // 이어 쓴 다음 획이 이 진행도 미만이면 "아직 시작 안 함"으로 본다

// 글자 하나의 획 순서를 관리한다. joins에 든 획은 손을 떼지 않고 다음 획으로 이어 써도 된다.
//
//   const lt = new LetterTracer(LETTERS.B, STROKE_WIDTH);
//   lt.begin(x, y) -> { ok, reason?, progress }
//   lt.move(x, y)  -> { ok, reason?, progress, chained? }   chained: 이번 이동에서 다음 획으로 넘어감
//   lt.end()       -> { ok, reason?, progress, strokeDone, letterDone, restarted? }
//                     strokeDone: 이번 터치로 완료된 획이 하나라도 있음
//                     restarted: 이어 쓰기로 넘어간 다음 획을 거의 안 그리고 떼서 그 획을 처음부터 다시 시작
export class LetterTracer {
  constructor(letter, strokeWidth) {
    this.paths = letter.strokes.map((s) => buildPath(s, 1));
    this.joins = new Set(letter.joins || []);
    this.strokeWidth = strokeWidth;
    this.index = 0;
    this.startStroke();
  }

  get strokeCount() {
    return this.paths.length;
  }

  get progress() {
    return this.tracer.progress;
  }

  get done() {
    return this.index >= this.paths.length;
  }

  // 현재 획의 판정기를 새로 만든다 (오답 재시도, 다음 획 진입 시).
  startStroke() {
    this.tracer = this.done ? null : new StrokeTracer(this.paths[this.index], this.strokeWidth);
    this.chained = false;
    this.detached = false;
  }

  begin(x, y) {
    this.chained = false;
    this.detached = false;
    this.touchStartIndex = this.index;
    return this.tracer.begin(x, y);
  }

  move(x, y) {
    if (this.detached) return { ok: true, progress: this.tracer.progress };

    // 이어 쓰기: 현재 획을 충분히 그렸고 다음 획으로 이어도 되는 획이면, 손가락이 다음 획 시작 구간에
    // 들어온 순간 다음 획 판정으로 넘어간다.
    if (!this.chained && this.joins.has(this.index) && this.index + 1 < this.paths.length && this.tracer.progress >= FINISH_ZONE) {
      const next = new StrokeTracer(this.paths[this.index + 1], this.strokeWidth);
      if (next.begin(x, y).ok) {
        this.index++;
        this.tracer = next;
        this.chained = true;
        return { ok: true, progress: next.progress, chained: true };
      }
    }

    const r = this.tracer.move(x, y);
    if (!r.ok && this.chained && r.progress < CHAIN_MIN_PROGRESS) {
      // 이어 쓰기로 넘어온 직후 살짝 벗어난 것은 오답이 아니다. 손을 뗄 때까지 무시한다.
      this.detached = true;
      return { ok: true, progress: r.progress };
    }
    return r;
  }

  end() {
    if (this.chained && this.tracer.progress < CHAIN_MIN_PROGRESS) {
      // 앞 획은 이미 완료. 다음 획은 사실상 시작 안 했으니 처음부터 다시.
      this.startStroke();
      return { ok: true, progress: 0, strokeDone: this.index > this.touchStartIndex, letterDone: false, restarted: true };
    }
    const r = this.tracer.end();
    if (!r.ok) return { ...r, strokeDone: this.index > this.touchStartIndex, letterDone: false };
    this.index++;
    this.startStroke();
    return { ok: true, progress: r.progress, strokeDone: true, letterDone: this.done };
  }
}
