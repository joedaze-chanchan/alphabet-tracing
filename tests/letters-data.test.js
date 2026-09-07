import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { LETTERS, LETTER_ORDER } from "../letters.js";

test("A~Z 26글자가 모두 있다", () => {
  assert.equal(LETTER_ORDER.join(""), "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
});

test("모든 글자에 읽기·파닉스·예시 단어와 발음 mp3가 있다", () => {
  for (const [name, l] of Object.entries(LETTERS)) {
    for (const k of ["ko", "sound", "word", "wordKo", "meaning"]) assert.ok(l[k], `${name}.${k}`);
    assert.ok(existsSync(new URL(`../audio/${name}.mp3`, import.meta.url)), `${name}.mp3`);
  }
});

test("joins는 마지막 획을 가리키지 않는다", () => {
  for (const [name, l] of Object.entries(LETTERS)) {
    for (const j of l.joins || []) assert.ok(j >= 0 && j < l.strokes.length - 1, `${name} joins ${j}`);
  }
});
