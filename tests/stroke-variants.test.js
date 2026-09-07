import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPath, LetterTracer } from "../tracer.js";
import { LETTERS, STROKE_WIDTH } from "../letters.js";

const ideal = (pts, step = 2) => buildPath(pts, step).map((p) => [p.x, p.y]);
const cont = (...strokes) => strokes.flatMap((s) => ideal(s)); // 손 안 떼고 이어 그리기

function touch(lt, pts) {
  const b = lt.begin(pts[0][0], pts[0][1]);
  if (!b.ok) return { ...b, phase: "begin" };
  for (let i = 1; i < pts.length; i++) {
    const r = lt.move(pts[i][0], pts[i][1]);
    if (!r.ok) return { ...r, phase: "move" };
  }
  return { ...lt.end(), phase: "end" };
}

test("Z를 1획으로 이어 쓰면 정답", () => {
  const lt = new LetterTracer(LETTERS.Z, STROKE_WIDTH);
  const r = touch(lt, cont(...LETTERS.Z.strokes));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.letterDone, true);
});

test("W를 1획으로 이어 쓰면 정답, 4획으로 떼어 써도 정답", () => {
  let lt = new LetterTracer(LETTERS.W, STROKE_WIDTH);
  assert.equal(touch(lt, cont(...LETTERS.W.strokes)).letterDone, true);
  lt = new LetterTracer(LETTERS.W, STROKE_WIDTH);
  let last;
  for (const s of LETTERS.W.strokes) last = touch(lt, ideal(s));
  assert.equal(last.letterDone, true);
});

test("T는 가로선 먼저, 세로선 나중", () => {
  const [bar, stem] = LETTERS.T.strokes;
  assert.equal(bar[0][1], bar[1][1], "1획은 가로선");
  assert.equal(stem[0][0], stem[1][0], "2획은 세로선");
  const lt = new LetterTracer(LETTERS.T, STROKE_WIDTH);
  assert.equal(touch(lt, ideal(stem)).reason, "start", "세로선부터 쓰면 오답");
  touch(lt, ideal(bar));
  assert.equal(touch(lt, ideal(stem)).letterDone, true);
});

test("R을 2획으로(굽은 획에서 다리까지 이어서) 써도 정답, 3획도 정답", () => {
  const [stem, bowl, leg] = LETTERS.R.strokes;
  let lt = new LetterTracer(LETTERS.R, STROKE_WIDTH);
  touch(lt, ideal(stem));
  // 굽은 획을 끝(왼쪽)까지 그린 뒤 오른쪽으로 되돌아와 다리로 내려간다
  const r = touch(lt, [...ideal(bowl), [30, 52], [40, 52], ...ideal(leg)]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.letterDone, true);
  lt = new LetterTracer(LETTERS.R, STROKE_WIDTH);
  touch(lt, ideal(stem));
  touch(lt, ideal(bowl));
  assert.equal(touch(lt, ideal(leg)).letterDone, true);
});

test("M: 시범대로 4획, 이어서 2~3획, 아래에서 시작해 1획 모두 정답", () => {
  const S = LETTERS.M.strokes;
  const A = LETTERS.M.alts[0].strokes;
  let lt = new LetterTracer(LETTERS.M, STROKE_WIDTH);
  let last;
  for (const s of S) last = touch(lt, ideal(s));
  assert.equal(last.letterDone, true, "4획");
  lt = new LetterTracer(LETTERS.M, STROKE_WIDTH);
  touch(lt, ideal(S[0]));
  assert.equal(touch(lt, cont(S[1], S[2], S[3])).letterDone, true, "2획");
  lt = new LetterTracer(LETTERS.M, STROKE_WIDTH);
  touch(lt, ideal(S[0]));
  touch(lt, cont(S[1], S[2]));
  assert.equal(touch(lt, ideal(S[3])).letterDone, true, "3획");
  lt = new LetterTracer(LETTERS.M, STROKE_WIDTH);
  const r = touch(lt, cont(...A));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.letterDone, true, "1획 (아래에서 시작)");
});

test("M을 아래에서 시작한 뒤에는 시범 방식(위에서 시작)으로 되돌아갈 수 없다", () => {
  const S = LETTERS.M.strokes;
  const A = LETTERS.M.alts[0].strokes;
  const lt = new LetterTracer(LETTERS.M, STROKE_WIDTH);
  touch(lt, ideal(A[0])); // 아래에서 위로
  assert.equal(lt.index, 1);
  assert.equal(touch(lt, ideal(S[1])).ok, true); // 두 번째 획은 두 방식이 같다
});

test("대체 획순이 없는 글자는 잘못된 방향이면 여전히 오답", () => {
  const lt = new LetterTracer(LETTERS.N, STROKE_WIDTH);
  assert.equal(touch(lt, ideal(LETTERS.N.strokes[0]).reverse()).reason, "start");
});
