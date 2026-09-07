import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPath, StrokeTracer } from "../tracer.js";
import { LETTERS, STROKE_WIDTH } from "../letters.js";

// 점 목록을 따라 손가락을 움직인 결과를 돌려준다.
function trace(tracer, pts) {
  const first = tracer.begin(pts[0][0], pts[0][1]);
  if (!first.ok) return first;
  for (let i = 1; i < pts.length; i++) {
    const r = tracer.move(pts[i][0], pts[i][1]);
    if (!r.ok) return r;
  }
  return tracer.end();
}

// 중심선 점들을 촘촘히 보간해 "이상적인 손가락 궤적"을 만든다.
function ideal(points, step = 2) {
  return buildPath(points, step).map((p) => [p.x, p.y]);
}

function tracerFor(letter, strokeIndex) {
  return new StrokeTracer(buildPath(LETTERS[letter].strokes[strokeIndex]), STROKE_WIDTH);
}

test("올바른 궤적은 정답", () => {
  for (const [name, letter] of Object.entries(LETTERS)) {
    letter.strokes.forEach((stroke, i) => {
      const r = trace(tracerFor(name, i), ideal(stroke));
      assert.equal(r.ok, true, `${name} ${i + 1}획`);
    });
  }
});

test("약간 흔들린 궤적도 정답", () => {
  const stroke = LETTERS.A.strokes[0];
  const pts = ideal(stroke).map(([x, y], i) => [x + (i % 2 ? 5 : -5), y]);
  assert.equal(trace(tracerFor("A", 0), pts).ok, true);
});

test("역방향으로 시작하면 오답 start", () => {
  const pts = ideal(LETTERS.A.strokes[0]).reverse();
  const r = trace(tracerFor("A", 0), pts);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "start");
});

test("다른 획을 먼저 그리면 오답", () => {
  // E의 3획(가운데 가로선)은 1획 중간에서 시작하므로 시작점 검사에서 걸린다.
  const r1 = trace(tracerFor("E", 0), ideal(LETTERS.E.strokes[2]));
  assert.equal(r1.reason, "start");
  // A의 2획은 1획과 꼭대기를 공유하므로 첫 이동에서 이탈로 걸린다.
  const r2 = trace(tracerFor("A", 0), ideal(LETTERS.A.strokes[1]));
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, "off");
});

test("중간에 윤곽 밖으로 벗어나면 오답 off", () => {
  const pts = ideal(LETTERS.E.strokes[0]);
  pts.splice(20, 0, [60, 50]);
  const r = trace(tracerFor("E", 0), pts);
  assert.equal(r.reason, "off");
});

test("절반 그리다 뒤로 돌아가면 오답 off", () => {
  const pts = ideal(LETTERS.E.strokes[0]);
  const half = pts.slice(0, Math.floor(pts.length / 2));
  const back = half.slice(0, half.length - 15).reverse();
  const r = trace(tracerFor("E", 0), [...half, ...back]);
  assert.equal(r.reason, "off");
});

test("절반만 그리고 손을 떼면 오답 short", () => {
  const pts = ideal(LETTERS.E.strokes[0]);
  const r = trace(tracerFor("E", 0), pts.slice(0, Math.floor(pts.length / 2)));
  assert.equal(r.reason, "short");
});

test("끝에서 조금 못 미쳐도(85% 이상) 정답", () => {
  const pts = ideal(LETTERS.E.strokes[0]);
  const r = trace(tracerFor("E", 0), pts.slice(0, Math.floor(pts.length * 0.9)));
  assert.equal(r.ok, true);
});

test("C의 곡선을 따라 그리면 정답, 시계 방향은 오답", () => {
  const stroke = LETTERS.C.strokes[0];
  assert.equal(trace(tracerFor("C", 0), ideal(stroke)).ok, true);
  assert.equal(trace(tracerFor("C", 0), ideal(stroke).reverse()).reason, "start");
});

test("B의 위 굽은 획에서 아래 굽은 획으로 건너뛰면 오답 off", () => {
  const top = ideal(LETTERS.B.strokes[1]);
  const bottom = ideal(LETTERS.B.strokes[2]);
  const pts = [...top.slice(0, 5), ...bottom.slice(10)];
  assert.equal(trace(tracerFor("B", 1), pts).reason, "off");
});

test("획 데이터: 모든 획이 2점 이상이고 0~100 안", () => {
  for (const [name, letter] of Object.entries(LETTERS)) {
    assert.ok(letter.strokes.length >= 1, name);
    for (const stroke of letter.strokes) {
      assert.ok(stroke.length >= 2, `${name} 획 점 개수`);
      for (const [x, y] of stroke) {
        assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${name} 좌표 ${x},${y}`);
      }
    }
  }
});
