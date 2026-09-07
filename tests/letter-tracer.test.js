import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPath, LetterTracer } from "../tracer.js";
import { LETTERS, STROKE_WIDTH } from "../letters.js";

function ideal(points, step = 2) {
  return buildPath(points, step).map((p) => [p.x, p.y]);
}

// 한 번의 터치(누름→이동→뗌)를 흉내 낸다.
function touch(lt, pts) {
  const b = lt.begin(pts[0][0], pts[0][1]);
  if (!b.ok) return { ...b, phase: "begin" };
  let chained = false;
  for (let i = 1; i < pts.length; i++) {
    const r = lt.move(pts[i][0], pts[i][1]);
    if (r.chained) chained = true;
    if (!r.ok) return { ...r, phase: "move", chained };
  }
  return { ...lt.end(), phase: "end", chained };
}

const B = LETTERS.B;

test("B를 3획으로 쓰면 정답", () => {
  const lt = new LetterTracer(B, STROKE_WIDTH);
  assert.equal(touch(lt, ideal(B.strokes[0])).strokeDone, true);
  assert.equal(touch(lt, ideal(B.strokes[1])).strokeDone, true);
  const r = touch(lt, ideal(B.strokes[2]));
  assert.equal(r.strokeDone, true);
  assert.equal(r.letterDone, true);
});

test("B를 2획으로(굽은 획 두 개를 이어서) 써도 정답", () => {
  const lt = new LetterTracer(B, STROKE_WIDTH);
  assert.equal(touch(lt, ideal(B.strokes[0])).strokeDone, true);
  const r = touch(lt, [...ideal(B.strokes[1]), ...ideal(B.strokes[2])]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.chained, true);
  assert.equal(r.letterDone, true);
});

test("B 2획째를 끝점에서 정확히 떼면 3획째는 새로 시작 (오답 아님)", () => {
  const lt = new LetterTracer(B, STROKE_WIDTH);
  touch(lt, ideal(B.strokes[0]));
  const r = touch(lt, ideal(B.strokes[1]));
  assert.equal(r.ok, true);
  assert.equal(lt.index, 2, "3획째 대기 중이어야 함");
  const r3 = touch(lt, ideal(B.strokes[2]));
  assert.equal(r3.letterDone, true);
});

test("B 3획째로 넘어간 직후 살짝 벗어나도 오답 아님, 3획째는 처음부터", () => {
  const lt = new LetterTracer(B, STROKE_WIDTH);
  touch(lt, ideal(B.strokes[0]));
  const pts = [...ideal(B.strokes[1]), [30, 50], [20, 62], [10, 70]];
  const r = touch(lt, pts);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(lt.index, 2);
  assert.equal(touch(lt, ideal(B.strokes[2])).letterDone, true);
});

test("이어 쓰기가 허용되지 않은 글자(A)는 획을 이어 쓰면 오답", () => {
  const A = LETTERS.A;
  const lt = new LetterTracer(A, STROKE_WIDTH);
  const r = touch(lt, [...ideal(A.strokes[0]), ...ideal(A.strokes[0]).reverse(), ...ideal(A.strokes[1])]);
  assert.equal(r.ok, false);
});

test("B 2획째를 절반만 그리고 3획째 쪽으로 가면 오답", () => {
  const lt = new LetterTracer(B, STROKE_WIDTH);
  touch(lt, ideal(B.strokes[0]));
  const half = ideal(B.strokes[1]);
  const r = touch(lt, [...half.slice(0, Math.floor(half.length / 2)), ...ideal(B.strokes[2])]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "off");
});

test("joins가 없는 글자도 LetterTracer로 전부 정답 처리", () => {
  for (const [name, letter] of Object.entries(LETTERS)) {
    const lt = new LetterTracer(letter, STROKE_WIDTH);
    let last;
    for (const stroke of letter.strokes) last = touch(lt, ideal(stroke));
    assert.equal(last.letterDone, true, name);
  }
});
