import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPath, LetterTracer } from "../tracer.js";
import { LETTERS, STROKE_WIDTH } from "../letters.js";

const ideal = (pts, step = 2) => buildPath(pts, step).map((p) => [p.x, p.y]);

// 좌표가 드문드문 오는(빠른 손가락) 터치. moveTo와 end(x, y)를 쓴다.
function fastTouch(lt, pts) {
  const b = lt.begin(pts[0][0], pts[0][1]);
  if (!b.ok) return b;
  for (let i = 1; i < pts.length - 1; i++) {
    const r = lt.moveTo(pts[i][0], pts[i][1]);
    if (!r.ok) return r;
  }
  const last = pts[pts.length - 1];
  return lt.end(last[0], last[1]);
}

test("빠른 획: 좌표가 12단위(작은 판에서 약 25px)마다 드문드문 와도 모든 글자 정답", () => {
  for (const [name, letter] of Object.entries(LETTERS)) {
    const lt = new LetterTracer(letter, STROKE_WIDTH);
    let r;
    for (const stroke of letter.strokes) {
      const full = ideal(stroke);
      const sparse = full.filter((_, i) => i % 6 === 0);
      if (sparse[sparse.length - 1] !== full[full.length - 1]) sparse.push(full[full.length - 1]);
      r = fastTouch(lt, sparse);
      assert.equal(r.ok, true, `${name} ${JSON.stringify(r)}`);
    }
    assert.equal(r.letterDone, true, name);
  }
});

test("A의 짧은 가로선을 시작점과 끝점 두 좌표만으로 그어도 정답", () => {
  const lt = new LetterTracer(LETTERS.A, STROKE_WIDTH);
  fastTouch(lt, ideal(LETTERS.A.strokes[0]));
  fastTouch(lt, ideal(LETTERS.A.strokes[1]));
  const bar = LETTERS.A.strokes[2];
  const r = fastTouch(lt, [bar[0], bar[1]]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.letterDone, true);
});

test("손 뗀 좌표가 끝점이면 마지막 이동 좌표가 70%여도 정답", () => {
  const lt = new LetterTracer(LETTERS.E, STROKE_WIDTH);
  const pts = ideal(LETTERS.E.strokes[0]);
  const seventy = pts.slice(0, Math.floor(pts.length * 0.7));
  const r = fastTouch(lt, [...seventy, pts[pts.length - 1]]);
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("보간해도 선 밖으로 크게 벗어나면 여전히 오답", () => {
  const lt = new LetterTracer(LETTERS.E, STROKE_WIDTH);
  const pts = ideal(LETTERS.E.strokes[0]);
  const r = fastTouch(lt, [pts[0], [70, 50], pts[pts.length - 1]]);
  assert.equal(r.ok, false);
});

test("허용 반경 여유를 키우면 더 흔들린 궤적도 정답", () => {
  const stroke = LETTERS.E.strokes[0];
  const wobbly = ideal(stroke).map(([x, y], i) => [x + (i % 2 ? 16 : -16), y]);
  const strict = new LetterTracer(LETTERS.E, STROKE_WIDTH);
  assert.equal(fastTouch(strict, wobbly).ok, false);
  const loose = new LetterTracer(LETTERS.E, STROKE_WIDTH, { radiusMargin: 12 });
  assert.equal(fastTouch(loose, wobbly).ok, true);
});

test("취소(cancel)는 벌점 없이 현재 획을 되돌리고 다시 시작할 수 있다", () => {
  const lt = new LetterTracer(LETTERS.E, STROKE_WIDTH);
  const pts = ideal(LETTERS.E.strokes[0]);
  lt.begin(pts[0][0], pts[0][1]);
  lt.moveTo(pts[10][0], pts[10][1]);
  lt.cancel();
  assert.equal(lt.index, 0);
  assert.equal(fastTouch(lt, pts).ok, true);
});
