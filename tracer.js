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

export const CLOSED_EPS = 6; // 시작점과 끝점이 이보다 가까우면 닫힌 획(O, Q 등)으로 본다

export class StrokeTracer {
  constructor(path, strokeWidth, radiusMargin = RADIUS_MARGIN) {
    this.path = path;
    this.radius = strokeWidth / 2 + radiusMargin;
    this.progress = 0;
    this.active = false;
    const a = path[0];
    const b = path[path.length - 1];
    this.closed = Math.hypot(a.x - b.x, a.y - b.y) < CLOSED_EPS;
  }

  begin(x, y) {
    // 시작 구간 안에서만 가장 가까운 점을 찾는다. 닫힌 획은 끝점이 시작점 옆에 있어서
    // 전체에서 찾으면 "끝점 근처 → 시작 오류"가 되기 때문.
    const n = nearest(this.path, x, y, 0, START_ZONE);
    if (!n || n.d > this.radius) {
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
    if (n && n.d <= this.radius) {
      this.progress = Math.max(this.progress, n.t);
      return { ok: true, progress: this.progress };
    }
    // 닫힌 획을 거의 다 그린 뒤 시작점을 지나쳐 계속 도는 것은 정상 (아이들은 대개 조금 더 돈다)
    if (this.closed && this.progress >= FINISH_ZONE) {
      const wrap = nearest(this.path, x, y, 0, this.progress + WINDOW_AHEAD - 1);
      if (wrap && wrap.d <= this.radius) {
        this.progress = 1;
        return { ok: true, progress: 1 };
      }
    }
    this.active = false;
    return { ok: false, reason: "off", progress: this.progress };
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

// 획 묶음(strokes + joins) 하나의 순서를 관리한다. joins에 든 획은 손을 떼지 않고 다음 획으로 이어 써도 된다.
//
//   const t = new StrokeSetTracer({ strokes, joins }, STROKE_WIDTH);
//   t.begin(x, y) -> { ok, reason?, progress }
//   t.move(x, y)  -> { ok, reason?, progress, chained? }   chained: 이번 이동에서 다음 획으로 넘어감
//   t.end()       -> { ok, reason?, progress, strokeDone, letterDone, restarted? }
//                    strokeDone: 이번 터치로 완료된 획이 하나라도 있음
//                    restarted: 이어 쓰기로 넘어간 다음 획을 거의 안 그리고 떼서 그 획을 처음부터 다시 시작
export class StrokeSetTracer {
  constructor(set, strokeWidth, radiusMargin = RADIUS_MARGIN) {
    this.paths = set.strokes.map((s) => buildPath(s, 1));
    this.joins = new Set(set.joins || []);
    this.strokeWidth = strokeWidth;
    this.radiusMargin = radiusMargin;
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
    this.tracer = this.done ? null : new StrokeTracer(this.paths[this.index], this.strokeWidth, this.radiusMargin);
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
    if (this.detached) {
      // 이어 쓰기 직후 잠깐 벗어난 상태. 앞 획의 끝을 마저 그리는 중일 수 있으니,
      // 손가락이 다음 획 시작 구간으로 돌아오면 다시 이어 간다.
      const again = new StrokeTracer(this.paths[this.index], this.strokeWidth, this.radiusMargin);
      if (again.begin(x, y).ok) {
        this.tracer = again;
        this.detached = false;
        return { ok: true, progress: again.progress };
      }
      return { ok: true, progress: 0 };
    }

    // 이어 쓰기: 현재 획을 충분히 그렸고 다음 획으로 이어도 되는 획이면, 손가락이 다음 획 시작 구간에
    // 들어온 순간 다음 획 판정으로 넘어간다.
    // (한 터치 안에서 여러 번 이어질 수 있다. 예: Z, W를 1획으로)
    if (this.joins.has(this.index) && this.index + 1 < this.paths.length && this.tracer.progress >= FINISH_ZONE) {
      const next = new StrokeTracer(this.paths[this.index + 1], this.strokeWidth, this.radiusMargin);
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

// 글자 하나의 판정. 시범 획순(primary)과 대체 획순(alts)을 동시에 추적해서, 어느 한 방식으로든
// 맞게 쓰면 정답으로 본다. 예: M을 위에서 내려 긋는 4획 방식과, 아래에서 올려 긋는 1획 방식.
// API는 StrokeSetTracer와 같고, paths/index/strokeCount/progress/done은 앞서 가는 방식 기준이다.
export const INTERP_STEP = 2.5; // 터치 좌표 사이를 이 간격(좌표 단위)으로 보간해 판정한다

export class LetterTracer {
  // options.radiusMargin: 허용 반경 여유 (좌표 단위). 작은 쓰기 판에서는 크게 준다.
  constructor(letter, strokeWidth, options = {}) {
    const radiusMargin = options.radiusMargin ?? RADIUS_MARGIN;
    const sets = [{ strokes: letter.strokes, joins: letter.joins }, ...(letter.alts || [])];
    this.variants = sets.map((set) => new StrokeSetTracer(set, strokeWidth, radiusMargin));
    this.alive = [...this.variants]; // 지금까지의 획과 모순되지 않는 방식들
    this.touching = []; // 현재 터치에서 아직 살아 있는 방식들
    this.last = null; // 마지막으로 받은 손가락 위치 (보간용)
  }

  // 손가락이 빨리 움직여 좌표가 드문드문 올 때도 놓치지 않도록, 직전 위치에서 지금 위치까지
  // 잘게 나눠 move()를 여러 번 부른다. 첫 실패를 그대로 돌려준다.
  moveTo(x, y) {
    if (!this.last) return this.move(x, y);
    const [x0, y0] = this.last;
    const d = Math.hypot(x - x0, y - y0);
    const n = Math.max(1, Math.ceil(d / INTERP_STEP));
    let r = { ok: true, progress: this.progress };
    let chained = false;
    for (let i = 1; i <= n; i++) {
      r = this.move(x0 + ((x - x0) * i) / n, y0 + ((y - y0) * i) / n);
      if (r.chained) chained = true;
      if (!r.ok) return r;
    }
    return chained ? { ...r, chained: true } : r;
  }

  get leading() {
    return this.touching[0] || this.alive[0] || this.variants[0];
  }
  get paths() {
    return this.leading.paths;
  }
  get index() {
    return this.leading.index;
  }
  get strokeCount() {
    return this.leading.strokeCount;
  }
  get progress() {
    return this.leading.progress;
  }
  get done() {
    return this.leading.done;
  }

  startStroke() {
    this.touching = [];
    this.last = null;
    for (const v of this.alive) v.startStroke();
  }

  // 터치가 브라우저에 의해 취소됐을 때: 벌점 없이 현재 획을 처음 상태로
  cancel() {
    this.startStroke();
  }

  // 이어하기: 앞의 n개 획을 이미 쓴 것으로 하고 n번째 획부터 시작한다
  skipTo(n) {
    for (const v of this.alive) v.index = Math.max(0, Math.min(n, v.paths.length));
    this.startStroke();
  }

  begin(x, y) {
    this.last = [x, y];
    const results = this.alive.map((v) => [v, v.begin(x, y)]);
    this.touching = results.filter(([, r]) => r.ok).map(([v]) => v);
    if (this.touching.length === 0) return results[0][1];
    return results.find(([v]) => v === this.touching[0])[1];
  }

  move(x, y) {
    this.last = [x, y];
    if (this.touching.length === 0) return { ok: false, reason: "inactive", progress: 0 };
    const results = this.touching.map((v) => [v, v.move(x, y)]);
    const alive = results.filter(([, r]) => r.ok);
    if (alive.length === 0) {
      this.touching = [];
      return results[0][1];
    }
    this.touching = alive.map(([v]) => v);
    return alive[0][1];
  }

  // 손을 뗀 좌표(x, y)를 주면 그 지점까지 마저 판정한 뒤 끝낸다 (빠르게 긋고 떼는 경우 대비).
  end(x, y) {
    if (x !== undefined && this.touching.length > 0) {
      const r = this.moveTo(x, y);
      if (!r.ok) {
        this.touching = [];
        return { ...r, strokeDone: false, letterDone: false };
      }
    }
    this.last = null;
    if (this.touching.length === 0) return { ok: false, reason: "inactive", progress: 0, strokeDone: false, letterDone: false };
    const results = this.touching.map((v) => [v, v.end()]);
    const okOnes = results.filter(([, r]) => r.ok);
    this.touching = [];
    if (okOnes.length === 0) return results[0][1];
    this.alive = okOnes.map(([v]) => v); // 이 터치와 맞는 방식만 남긴다
    return okOnes[0][1];
  }
}
