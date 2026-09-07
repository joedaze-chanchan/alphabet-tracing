import { test } from "node:test";
import assert from "node:assert/strict";
import { ProfileStore, scopedStorage, ResumeStore, AVATARS, MAX_NAME_LENGTH } from "../profiles.js";
import { ProgressStore, SettingsStore, BestScoreStore } from "../progress.js";

// localStorage 흉내
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

test("참여자를 만들면 현재 참여자가 되고 목록에 남는다", () => {
  const st = memStorage();
  const ps = new ProfileStore(st);
  assert.equal(ps.current(), null);
  const a = ps.create("민준", "🦁");
  assert.equal(ps.current().id, a.id);
  const b = ps.create("서연", "🦄");
  assert.equal(ps.current().id, b.id);
  assert.deepEqual(ps.list().map((p) => p.name), ["민준", "서연"]);
  ps.select(a.id);
  assert.equal(ps.current().name, "민준");
});

test("이름은 공백을 다듬고 8글자까지만, 빈 이름은 거부", () => {
  const ps = new ProfileStore(memStorage());
  assert.throws(() => ps.create("   ", AVATARS[0]));
  const p = ps.create("  아주긴이름입니다정말  ", AVATARS[1]);
  assert.equal(p.name.length, MAX_NAME_LENGTH);
});

test("참여자별 저장소는 서로 섞이지 않는다", () => {
  const st = memStorage();
  const ps = new ProfileStore(st);
  const a = ps.create("A", "🦁");
  const b = ps.create("B", "🦄");
  const progA = new ProgressStore(scopedStorage(a.id, st));
  const progB = new ProgressStore(scopedStorage(b.id, st));
  progA.markCompleted("A");
  assert.equal(progA.get("A").completed, true);
  assert.equal(progB.get("A").completed, false);
  const bestA = new BestScoreStore(scopedStorage(a.id, st));
  const bestB = new BestScoreStore(scopedStorage(b.id, st));
  bestA.update("easy", 50);
  assert.equal(bestB.get("easy"), 0);
  const setA = new SettingsStore(scopedStorage(a.id, st));
  const setB = new SettingsStore(scopedStorage(b.id, st));
  setA.save({ repeat: 2 });
  assert.equal(setB.load(), null, "B는 아직 첫 실행 설정 전");
});

test("첫 참여자는 예전(참여자 없던 시절) 기록을 넘겨받는다", () => {
  const st = memStorage();
  new ProgressStore(st).markCompleted("C");
  new BestScoreStore(st).update("easy", 70);
  const ps = new ProfileStore(st);
  const first = ps.create("첫째", "🐻");
  assert.equal(new ProgressStore(scopedStorage(first.id, st)).get("C").completed, true);
  assert.equal(new BestScoreStore(scopedStorage(first.id, st)).get("easy"), 70);
  assert.equal(st.getItem("abc-trace-progress"), null, "옛 키는 지워진다");
  const second = ps.create("둘째", "🐼");
  assert.equal(new ProgressStore(scopedStorage(second.id, st)).get("C").completed, false);
});

test("참여자를 지우면 기록도 지워지고 다른 참여자가 현재가 된다", () => {
  const st = memStorage();
  const ps = new ProfileStore(st);
  const a = ps.create("A", "🦁");
  const b = ps.create("B", "🦄");
  new ProgressStore(scopedStorage(b.id, st)).markCompleted("Z");
  ps.remove(b.id);
  assert.equal(ps.current().id, a.id);
  assert.equal(st.getItem(`abc-trace-progress@${b.id}`), null);
});

test("이어하기 기록: 연습과 게임을 따로 저장·삭제", () => {
  const st = memStorage();
  const rs = new ResumeStore(scopedStorage("p1", st));
  assert.equal(rs.get("practice"), null);
  rs.set("practice", { letter: "B", round: 2, strokeIndex: 1 });
  rs.set("game", { level: "easy", score: 30, lives: 2, round: { en: "DUCK", phase: 1 } });
  assert.equal(rs.get("practice").letter, "B");
  assert.equal(rs.get("game").round.en, "DUCK");
  assert.ok(rs.get("game").savedAt);
  rs.clear("practice");
  assert.equal(rs.get("practice"), null);
  assert.equal(rs.get("game").score, 30);
  const other = new ResumeStore(scopedStorage("p2", st));
  assert.equal(other.get("game"), null, "다른 참여자에게는 안 보인다");
});
