import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPath, LetterTracer, StrokeTracer } from "../tracer.js";
import { LETTERS, STROKE_WIDTH } from "../letters.js";

const ideal = (pts, step = 2) => buildPath(pts, step).map((p) => [p.x, p.y]);

function touch(lt, pts) {
  const b = lt.begin(pts[0][0], pts[0][1]);
  if (!b.ok) return b;
  for (let i = 1; i < pts.length - 1; i++) {
    const r = lt.moveTo(pts[i][0], pts[i][1]);
    if (!r.ok) return r;
  }
  const last = pts[pts.length - 1];
  return lt.end(last[0], last[1]);
}

test("O와 Q의 첫 획은 닫힌 획으로 인식된다", () => {
  assert.equal(new StrokeTracer(buildPath(LETTERS.O.strokes[0]), STROKE_WIDTH).closed, true);
  assert.equal(new StrokeTracer(buildPath(LETTERS.Q.strokes[0]), STROKE_WIDTH).closed, true);
  assert.equal(new StrokeTracer(buildPath(LETTERS.C.strokes[0]), STROKE_WIDTH).closed, false);
});

test("O: 꼭대기에서 살짝 오른쪽(끝점 쪽)에 손을 대고 시작해도 정답", () => {
  const pts = ideal(LETTERS.O.strokes[0]);
  const lt = new LetterTracer(LETTERS.O, STROKE_WIDTH);
  const r = touch(lt, [[57, 9], ...pts.slice(1)]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.letterDone, true);
});

test("O: 한 바퀴 돌고 시작점을 지나 조금 더 돌아도 정답", () => {
  const pts = ideal(LETTERS.O.strokes[0]);
  const lt = new LetterTracer(LETTERS.O, STROKE_WIDTH);
  const overshoot = pts.slice(1, Math.floor(pts.length * 0.2)); // 시작 구간을 다시 지나감
  const r = touch(lt, [...pts, ...overshoot]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.letterDone, true);
});

test("O: 시계 방향(반대)으로 돌면 여전히 오답", () => {
  const pts = ideal(LETTERS.O.strokes[0]).reverse();
  const lt = new LetterTracer(LETTERS.O, STROKE_WIDTH);
  const r = touch(lt, [pts[0], ...pts.slice(1)]);
  assert.equal(r.ok, false);
});

test("O: 반만 그리고 떼면 오답 short", () => {
  const pts = ideal(LETTERS.O.strokes[0]);
  const lt = new LetterTracer(LETTERS.O, STROKE_WIDTH);
  const r = touch(lt, pts.slice(0, Math.floor(pts.length / 2)));
  assert.equal(r.reason, "short");
});

test("닫히지 않은 글자(C)는 끝점 근처에서 시작하면 오답 start", () => {
  const pts = ideal(LETTERS.C.strokes[0]);
  const lt = new LetterTracer(LETTERS.C, STROKE_WIDTH);
  const end = pts[pts.length - 1];
  assert.equal(lt.begin(end[0], end[1]).reason, "start");
});
