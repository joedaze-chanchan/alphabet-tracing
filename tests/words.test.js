import { test } from "node:test";
import assert from "node:assert/strict";
import { WORDS, DIFFICULTY, DIFFICULTY_ORDER, pickTarget, speedMultiplier, SPEED_RAMP_MAX, MEANINGS, makeChoices } from "../words.js";
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

test("난이도는 쉬움·보통 두 단계, 둘 다 한 대씩, 보통이 조금 빠르다", () => {
  assert.deepEqual(DIFFICULTY_ORDER, ["easy", "medium"]);
  const [e, m] = DIFFICULTY_ORDER.map((k) => DIFFICULTY[k]);
  assert.ok(e.speed < m.speed);
  assert.equal(e.maxShips, 1);
  assert.equal(m.maxShips, 1);
});

test("모든 단어에 한글 뜻이 있다", () => {
  for (const list of Object.values(WORDS)) for (const w of list) assert.ok(MEANINGS[w], w);
});

test("4지선다 보기는 정답을 포함한 서로 다른 4개", () => {
  const pool = WORDS.easy.map((en) => ({ en, ko: MEANINGS[en] }));
  for (let i = 0; i < 50; i++) {
    const answer = pool[i % pool.length];
    const ch = makeChoices(answer, pool);
    assert.equal(ch.length, 4);
    assert.ok(ch.some((c) => c.en === answer.en));
    assert.equal(new Set(ch.map((c) => c.en)).size, 4);
    assert.equal(new Set(ch.map((c) => c.ko)).size, 4);
  }
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
