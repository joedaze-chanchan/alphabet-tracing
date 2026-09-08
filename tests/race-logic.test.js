import { test } from "node:test";
import assert from "node:assert/strict";
import { makeQuestion, laneFromX, speedFor, LANES, LANE_CENTERS, MAX_SPEED, BASE_SPEED, RACE_DIFFICULTY_ORDER } from "../race-logic.js";
import { MEANINGS, DIFFICULTY } from "../words.js";
import { LETTERS } from "../letters.js";

test("문제: 간판 4개 중 하나가 정답이고 나머지는 서로 다르다", () => {
  for (const level of RACE_DIFFICULTY_ORDER) {
    for (let i = 0; i < 60; i++) {
      const dir = i % 2 ? "ko2en" : "en2ko";
      const q = makeQuestion(level, null, dir);
      assert.equal(q.signs.length, LANES);
      assert.equal(new Set(q.signs).size, LANES, JSON.stringify(q.signs));
      const expected = dir === "en2ko" ? q.ko : q.en;
      assert.equal(q.signs[q.answer], expected);
      assert.equal(q.prompt, dir === "en2ko" ? q.en : q.ko);
      if (!q.isLetter) {
        assert.ok(DIFFICULTY[level].words.includes(q.en));
        assert.equal(q.ko, MEANINGS[q.en]);
      } else {
        assert.equal(q.ko, LETTERS[q.en].ko);
      }
    }
  }
});

test("문제: 직전 단어와 다른 단어가 나온다", () => {
  let prev = null;
  for (let i = 0; i < 100; i++) {
    const q = makeQuestion("medium", prev);
    assert.notEqual(q.en, prev);
    prev = q.en;
  }
});

test("차선 판정: 차선 중심은 자기 차선, 경계 밖은 끝 차선", () => {
  LANE_CENTERS.forEach((c, i) => assert.equal(laneFromX(c), i));
  assert.equal(laneFromX(-9), 0);
  assert.equal(laneFromX(9), 3);
  assert.equal(laneFromX(-0.01), 1);
  assert.equal(laneFromX(0.01), 2);
});

test("속도는 정답마다 오르고 상한이 있다", () => {
  assert.equal(speedFor(0), BASE_SPEED);
  assert.ok(speedFor(5) > BASE_SPEED);
  assert.equal(speedFor(1000), MAX_SPEED);
});
