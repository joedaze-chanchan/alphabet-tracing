import { test } from "node:test";
import assert from "node:assert/strict";
import { WORDS, DIFFICULTY, DIFFICULTY_ORDER, pickTarget, speedMultiplier, SPEED_RAMP_MAX } from "../words.js";
import { LETTERS } from "../letters.js";

test("단어는 모두 대문자이고 획 데이터가 있는 글자로만 되어 있다", () => {
  for (const [level, list] of Object.entries(WORDS)) {
    for (const w of list) {
      assert.match(w, /^[A-Z]+$/, `${level} ${w}`);
      for (const ch of w) assert.ok(LETTERS[ch], `${w}의 ${ch}`);
    }
  }
});

test("단어 길이: 쉬움 3, 보통 4, 어려움 5", () => {
  assert.ok(WORDS.easy.every((w) => w.length === 3));
  assert.ok(WORDS.medium.every((w) => w.length === 4));
  assert.ok(WORDS.hard.every((w) => w.length === 5));
});

test("난이도는 쉬움·보통 두 단계이고 보통이 더 빠르고 비행선이 많다", () => {
  assert.deepEqual(DIFFICULTY_ORDER, ["easy", "medium"]);
  const [e, m] = DIFFICULTY_ORDER.map((k) => DIFFICULTY[k]);
  assert.ok(e.speed < m.speed);
  assert.ok(e.maxShips < m.maxShips);
  // 보통은 두 대가 동시에 나오는 대신 등장 간격은 오히려 길게 둔다 (사용자 요청: 천천히)
});

test("pickTarget은 난이도 목록 안에서 고르고 직전 것과 다르다", () => {
  for (const key of DIFFICULTY_ORDER) {
    let prev = null;
    for (let i = 0; i < 200; i++) {
      const w = pickTarget(key, prev);
      const ok = DIFFICULTY[key].words.includes(w) || (w.length === 1 && DIFFICULTY[key].singleLetterRate > 0);
      assert.ok(ok, `${key} ${w}`);
      assert.notEqual(w, prev);
      prev = w;
    }
  }
});

test("쉬움에서만 글자 하나짜리 목표가 나온다", () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(pickTarget("easy").length);
  assert.ok(seen.has(1) && seen.has(3));
  for (let i = 0; i < 100; i++) assert.ok(pickTarget("medium").length > 1);
});

test("격추할수록 빨라지되 상한이 있다", () => {
  assert.equal(speedMultiplier(0), 1);
  assert.ok(speedMultiplier(5) > 1);
  assert.equal(speedMultiplier(1000), SPEED_RAMP_MAX);
});
