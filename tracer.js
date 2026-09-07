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
