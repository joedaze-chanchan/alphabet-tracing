import { test } from "node:test";
import assert from "node:assert/strict";
import { BoardStore } from "../progress.js";
import { totalScore, SCORE_PER_COIN, DRIVE_SCORE_PER_UNIT } from "../race-logic.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("기록판: 점수 순으로 정렬되고 순위를 돌려준다", () => {
  const b = new BoardStore("t", memStorage());
  assert.equal(b.add({ profileId: "a", name: "A", avatar: "🦁", score: 50, level: "easy" }), 1);
  assert.equal(b.add({ profileId: "b", name: "B", avatar: "🦊", score: 80, level: "medium" }), 1);
  assert.equal(b.add({ profileId: "a", name: "A", avatar: "🦁", score: 60, level: "easy" }), 2);
  assert.equal(b.add({ profileId: "c", name: "C", avatar: "🐸", score: 80, level: "easy" }), 2, "같은 점수는 먼저 낸 쪽이 위");
  assert.deepEqual(b.top(3).map((e) => `${e.name}${e.score}`), ["B80", "C80", "A60"]);
  assert.equal(b.top(10).length, 4);
});

test("기록판은 참여자별 저장소와 별개로 한 곳에 모인다", () => {
  const st = memStorage();
  const b1 = new BoardStore("abc-race-board", st);
  const b2 = new BoardStore("abc-race-board", st);
  b1.add({ profileId: "a", name: "A", avatar: "", score: 10, level: "easy" });
  assert.equal(b2.top(1)[0].name, "A");
});

test("총점 = 간판 + 코인 + 주행(내림)", () => {
  assert.equal(totalScore({ score: 30, coinScore: SCORE_PER_COIN * 2, drive: 7.9 }), 30 + 10 + 7);
  assert.equal(Math.floor(25 * DRIVE_SCORE_PER_UNIT), 5, "25단위 달리면 5점");
});
